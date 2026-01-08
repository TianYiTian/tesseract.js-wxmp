/* global wx */
'use strict';

/**
 *
 * WeChat miniapp worker scripts
 *
 * @fileoverview WeChat miniapp worker implementation
 */

const workerScript = require('..');
const getCore = require('./getCore');
const gunzip = require('./gunzip');

const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log('[OCR-WORKER]', ...args);
};

const getWx = () => {
  if (typeof wx !== 'undefined') return wx;
  if (typeof global !== 'undefined' && global.wx) return global.wx;
  return undefined;
};

const getWorkerGlobal = () => {
  if (typeof worker !== 'undefined') return worker;
  if (typeof globalThis !== 'undefined' && globalThis.worker) return globalThis.worker;
  if (typeof self !== 'undefined' && self.worker) return self.worker;
  if (typeof global !== 'undefined' && global.worker) return global.worker;
  return undefined;
};

const getSelf = () => {
  if (typeof self !== 'undefined') return self;
  if (typeof globalThis !== 'undefined') return globalThis;
  return undefined;
};

const logEnvCaps = () => {
  const wxApi = getWx();
  const caps = {
    hasWx: !!wxApi,
    hasRequest: !!(wxApi && typeof wxApi.request === 'function'),
    hasDownload: !!(wxApi && typeof wxApi.downloadFile === 'function'),
    hasFS: !!(wxApi && typeof wxApi.getFileSystemManager === 'function'),
    hasFetch: typeof fetch === 'function',
  };
  log('env', caps);
  return caps;
};

const isPacket = (value) => (
  value
  && typeof value === 'object'
  && (
    Object.prototype.hasOwnProperty.call(value, 'action')
    || Object.prototype.hasOwnProperty.call(value, 'jobId')
    || Object.prototype.hasOwnProperty.call(value, 'status')
    || Object.prototype.hasOwnProperty.call(value, 'workerId')
  )
);

const unwrapMessage = (msg) => {
  let current = msg;
  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== 'object') break;
    if (isPacket(current)) return current;
    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
    } else {
      break;
    }
  }
  return current;
};

const registerMessageHandler = (handler) => {
  const workerGlobal = getWorkerGlobal();
  if (workerGlobal && typeof workerGlobal.onMessage === 'function') {
    log('register handler via worker.onMessage');
    workerGlobal.onMessage((msg) => handler(unwrapMessage(msg)));
    return;
  }
  const wxApi = getWx();
  if (wxApi && typeof wxApi.onMessage === 'function') {
    log('register handler via wx.onMessage');
    wxApi.onMessage((msg) => handler(unwrapMessage(msg)));
    return;
  }
  if (typeof onMessage === 'function') {
    log('register handler via onMessage');
    onMessage((msg) => handler(unwrapMessage(msg))); // eslint-disable-line no-undef
    return;
  }
  const selfObj = getSelf();
  if (selfObj && typeof selfObj.addEventListener === 'function') {
    log('register handler via self.addEventListener');
    selfObj.addEventListener('message', (msg) => handler(unwrapMessage(msg)));
    return;
  }
  if (selfObj && typeof selfObj.onmessage !== 'undefined') {
    log('register handler via self.onmessage');
    selfObj.onmessage = (msg) => handler(unwrapMessage(msg));
    return;
  }
  if (typeof onmessage !== 'undefined') {
    log('register handler via onmessage');
    onmessage = (msg) => handler(unwrapMessage(msg)); // eslint-disable-line no-undef
    return;
  }
  throw Error('No worker message handler available');
};

const sendMessage = (payload) => {
  const workerGlobal = getWorkerGlobal();
  if (workerGlobal && typeof workerGlobal.postMessage === 'function') {
    log('postMessage via worker', payload && payload.action, payload && payload.status);
    workerGlobal.postMessage(payload);
    return;
  }
  const wxApi = getWx();
  if (wxApi && typeof wxApi.postMessage === 'function') {
    log('postMessage via wx', payload && payload.action, payload && payload.status);
    wxApi.postMessage({ data: payload });
    return;
  }
  if (typeof postMessage === 'function') {
    log('postMessage via postMessage', payload && payload.action, payload && payload.status);
    postMessage(payload); // eslint-disable-line no-undef
    return;
  }
  const selfObj = getSelf();
  if (selfObj && typeof selfObj.postMessage === 'function') {
    log('postMessage via self', payload && payload.action, payload && payload.status);
    selfObj.postMessage(payload);
    return;
  }
  throw Error('No worker postMessage available');
};

const mirrorJsdelivr = (url) => {
  if (url.startsWith('https://cdn.jsdelivr.net/')) {
    return url.replace('https://cdn.jsdelivr.net', 'https://cdn.jsdmirror.com');
  }
  if (url.startsWith('http://cdn.jsdelivr.net/')) {
    return url.replace('http://cdn.jsdelivr.net', 'https://cdn.jsdmirror.com');
  }
  return url;
};

const describeImage = (img) => {
  const info = {
    type: Object.prototype.toString.call(img),
    ctor: img && img.constructor ? img.constructor.name : '',
    length: img && typeof img.length === 'number' ? img.length : undefined,
    byteLength: img && (img.byteLength || (img.buffer && img.buffer.byteLength) || undefined),
    keys: img && typeof img === 'object' ? Object.keys(img).slice(0, 8) : [],
  };
  if (img && img.data) {
    const d = img.data;
    info.dataType = Object.prototype.toString.call(d);
    info.dataCtor = d && d.constructor ? d.constructor.name : '';
    info.dataLength = d && typeof d.length === 'number' ? d.length : undefined;
    info.dataByteLength = d && (d.byteLength || (d.buffer && d.buffer.byteLength) || undefined);
    info.dataKeys = d && typeof d === 'object' ? Object.keys(d).slice(0, 8) : [];
  }
  return info;
};

let fetchRequestCounter = 0;
const pendingFetch = new Map();
let fsRequestCounter = 0;
const pendingFs = new Map();

const normalizeArrayBuffer = (data) => {
  if (!data) return data;
  if (data instanceof ArrayBuffer) return data;
  if (data.buffer instanceof ArrayBuffer) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return data;
};

const handleFetchResponse = (packet) => {
  if (!packet || packet.action !== 'fetch-response') return false;
  const { requestId, ok, status, data, error } = packet;
  const pending = pendingFetch.get(requestId);
  if (!pending) return true;
  try {
    const type = data ? Object.prototype.toString.call(data) : 'null';
    const ctor = data && data.constructor ? data.constructor.name : '';
    const byteLength = data && (data.byteLength || (data.buffer && data.buffer.byteLength) || data.length || 0);
    sendMessage({
      action: 'fetch-ack',
      requestId,
      ok: !!ok,
      status: status || 0,
      type,
      ctor,
      byteLength,
    });
  } catch (err) {
    sendMessage({
      action: 'fetch-ack',
      requestId,
      ok: !!ok,
      status: status || 0,
      error: err && err.message ? err.message : String(err),
    });
  }
  pendingFetch.delete(requestId);
  if (!ok) {
    pending.reject(Error(error || `fetch failed: ${status || 0}`));
    return true;
  }
  const buffer = normalizeArrayBuffer(data);
  pending.resolve({
    ok: true,
    status: status || 200,
    arrayBuffer: async () => buffer,
  });
  return true;
};

const handleFsResponse = (packet) => {
  if (!packet || packet.action !== 'fs-response') return false;
  const { requestId } = packet;
  const pending = pendingFs.get(requestId);
  if (!pending) return true;
  pendingFs.delete(requestId);
  pending.resolve(packet);
  return true;
};

const fetchViaMainThread = (url) => new Promise((resolve, reject) => {
  const requestUrl = mirrorJsdelivr(url);
  const requestId = `fetch-${fetchRequestCounter += 1}`;
  pendingFetch.set(requestId, { resolve, reject });
  log('fetch->main', requestId, requestUrl);
  sendMessage({ action: 'fetch', requestId, url: requestUrl });
});

fetchViaMainThread.__tessjs_override = true;

const fsRequest = (action, payload) => new Promise((resolve, reject) => {
  const requestId = `fs-${fsRequestCounter += 1}`;
  pendingFs.set(requestId, { resolve, reject });
  try {
    sendMessage({ action, requestId, ...payload });
  } catch (err) {
    pendingFs.delete(requestId);
    reject(err);
  }
});

const readCacheViaMain = (path) => fsRequest('fs-read', { path }).then((resp) => {
  if (!resp || !resp.ok) return undefined;
  const data = resp.data;
  if (!data) return undefined;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data.buffer instanceof ArrayBuffer) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return new Uint8Array(data);
});

const writeCacheViaMain = (path, data) => {
  const buffer = normalizeArrayBuffer(data);
  return fsRequest('fs-write', { path, data: buffer }).then(() => undefined);
};

const deleteCacheViaMain = (path) => fsRequest('fs-delete', { path }).then(() => undefined);

const checkCacheViaMain = (path) => fsRequest('fs-check', { path }).then((resp) => !!(resp && resp.exists));

registerMessageHandler((packet) => {
  if (handleFsResponse(packet)) return;
  if (handleFetchResponse(packet)) return;
  if (packet && packet.action === 'recognize' && packet.payload && packet.payload.image) {
    try {
      sendMessage({ action: 'image-info', data: describeImage(packet.payload.image) });
    } catch (err) {
      sendMessage({ action: 'image-info', error: err && err.message ? err.message : String(err) });
    }
  }
  log('recv', packet && packet.action, packet && packet.jobId);
  workerScript.dispatchHandlers(packet, (obj) => sendMessage(obj));
});

const envCaps = logEnvCaps();
try {
  sendMessage({ action: 'env', data: envCaps });
} catch (err) {
  log('env postMessage failed', err && err.message ? err.message : err);
}

workerScript.setAdapter({
  getCore,
  gunzip,
  fetch: fetchViaMainThread,
  readCache: readCacheViaMain,
  writeCache: writeCacheViaMain,
  deleteCache: deleteCacheViaMain,
  checkCache: checkCacheViaMain,
});
