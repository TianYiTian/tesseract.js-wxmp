'use strict';

const resolvePaths = require('./utils/resolvePaths');
const createJob = require('./createJob');
const { log } = require('./utils/log');
const getId = require('./utils/getId');
const OEM = require('./constants/OEM');
const {
  defaultOptions,
  spawnWorker,
  terminateWorker,
  onMessage,
  loadImage,
  send,
} = require('./worker/miniapp');

let workerCounter = 0;

const getWx = () => {
  if (typeof wx !== 'undefined') return wx;
  if (typeof global !== 'undefined' && global.wx) return global.wx;
  return undefined;
};

const resolveCachePath = (inputPath) => {
  const wxApi = getWx();
  const base = wxApi && wxApi.env ? wxApi.env.USER_DATA_PATH : '';
  if (!inputPath || inputPath === '.' || inputPath === './') {
    return base || inputPath;
  }
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/')) {
    return normalized;
  }
  if (!base) {
    return normalized;
  }
  return `${base}/${normalized}`;
};

const ensureDir = (filePath) => new Promise((resolve) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
    resolve();
    return;
  }
  const fs = wxApi.getFileSystemManager();
  const idx = filePath.lastIndexOf('/');
  if (idx <= 0) {
    resolve();
    return;
  }
  const dirPath = filePath.slice(0, idx);
  fs.mkdir({
    dirPath,
    recursive: true,
    success: resolve,
    fail: resolve,
  });
});

const normalizeWriteBuffer = (data) => {
  if (!data) return data;
  if (data instanceof ArrayBuffer) return data;
  if (data.buffer instanceof ArrayBuffer) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return data;
};

module.exports = async (langs = 'eng', oem = OEM.LSTM_ONLY, _options = {}, config = {}) => {
  const id = getId('Worker', workerCounter);
  const {
    logger,
    errorHandler,
    ...options
  } = resolvePaths({
    ...defaultOptions,
    ..._options,
  });
  // eslint-disable-next-line no-console
  console.log('[OCR-MAIN] createWorker options', {
    workerPath: options.workerPath,
    corePath: options.corePath,
    langPath: options.langPath,
  });
  const promises = {};

  // Current langs, oem, and config file.
  // Used if the user ever re-initializes the worker using `worker.reinitialize`.
  const currentLangs = typeof langs === 'string' ? langs.split('+') : langs;
  let currentOem = oem;
  let currentConfig = config;
  const lstmOnlyCore = [OEM.DEFAULT, OEM.LSTM_ONLY].includes(oem) && !options.legacyCore;

  let workerResReject;
  let workerResResolve;
  const workerRes = new Promise((resolve, reject) => {
    workerResResolve = resolve;
    workerResReject = reject;
  });
  const workerError = (event) => { workerResReject(event.message); };

  let worker = spawnWorker(options);
  worker.onerror = workerError;

  workerCounter += 1;

  const startJob = ({ id: jobId, action, payload }) => (
    new Promise((resolve, reject) => {
      log(`[${id}]: Start ${jobId}, action=${action}`);
      // Using both `action` and `jobId` in case user provides non-unique `jobId`.
      const promiseId = `${action}-${jobId}`;
      promises[promiseId] = { resolve, reject };
      send(worker, {
        workerId: id,
        jobId,
        action,
        payload,
      });
    })
  );

  const load = () => (
    console.warn('`load` is depreciated and should be removed from code (workers now come pre-loaded)')
  );

  const loadInternal = (jobId) => (
    startJob(createJob({
      id: jobId, action: 'load', payload: { options: { lstmOnly: lstmOnlyCore, corePath: options.corePath, logging: options.logging } },
    }))
  );

  const writeText = (path, text, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'FS',
      payload: { method: 'writeFile', args: [path, text] },
    }))
  );

  const readText = (path, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'FS',
      payload: { method: 'readFile', args: [path, { encoding: 'utf8' }] },
    }))
  );

  const removeFile = (path, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'FS',
      payload: { method: 'unlink', args: [path] },
    }))
  );

  const FS = (method, args, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'FS',
      payload: { method, args },
    }))
  );

  const loadLanguageInternal = (_langs, jobId) => startJob(createJob({
    id: jobId,
    action: 'loadLanguage',
    payload: {
      langs: _langs,
      options: {
        langPath: options.langPath,
        dataPath: options.dataPath,
        cachePath: options.cachePath,
        cacheMethod: options.cacheMethod,
        gzip: options.gzip,
        lstmOnly: [OEM.DEFAULT, OEM.LSTM_ONLY].includes(currentOem)
          && !options.legacyLang,
      },
    },
  }));

  const initializeInternal = (_langs, _oem, _config, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'initialize',
      payload: { langs: _langs, oem: _oem, config: _config },
    }))
  );

  const reinitialize = (langs = 'eng', oem, config, jobId) => { // eslint-disable-line

    if (lstmOnlyCore && [OEM.TESSERACT_ONLY, OEM.TESSERACT_LSTM_COMBINED].includes(oem)) throw Error('Legacy model requested but code missing.');

    const _oem = oem || currentOem;
    currentOem = _oem;

    const _config = config || currentConfig;
    currentConfig = _config;

    // Only load langs that are not already loaded.
    // This logic fails if the user downloaded the LSTM-only English data for a language
    // and then uses `worker.reinitialize` to switch to the Legacy engine.
    // However, the correct data will still be downloaded after initialization fails
    // and this can be avoided entirely if the user loads the correct data ahead of time.
    const langsArr = typeof langs === 'string' ? langs.split('+') : langs;
    const _langs = langsArr.filter((x) => !currentLangs.includes(x));
    currentLangs.push(..._langs);

    if (_langs.length > 0) {
      return loadLanguageInternal(_langs, jobId)
        .then(() => initializeInternal(langs, _oem, _config, jobId));
    }

    return initializeInternal(langs, _oem, _config, jobId);
  };

  const setParameters = (params = {}, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'setParameters',
      payload: { params },
    }))
  );

  const recognize = async (image, opts = {}, output = {
    text: true,
  }, jobId) => (
    startJob(createJob({
      id: jobId,
      action: 'recognize',
      payload: { image: await loadImage(image), options: opts, output },
    }))
  );

  const detect = async (image, jobId) => {
    if (lstmOnlyCore) throw Error('`worker.detect` requires Legacy model, which was not loaded.');

    return startJob(createJob({
      id: jobId,
      action: 'detect',
      payload: { image: await loadImage(image) },
    }));
  };

  const terminate = async () => {
    if (worker !== null) {
      /*
      await startJob(createJob({
        id: jobId,
        action: 'terminate',
      }));
      */
      terminateWorker(worker);
      worker = null;
    }
    return Promise.resolve();
  };

  const postFetchResponse = (requestId, payload) => {
    const size = payload && payload.data
      ? (payload.data.byteLength || payload.data.length || 0)
      : 0;
    try {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fetch-response', requestId, payload && payload.ok, payload && payload.status, size);
      worker.postMessage({
        action: 'fetch-response',
        requestId,
        ...payload,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fetch-response failed', requestId, err && err.message ? err.message : err);
    }
  };

  const handleFetchRequest = (payload) => {
    if (!payload || payload.action !== 'fetch') return false;
    const { requestId, url } = payload;
    // eslint-disable-next-line no-console
    console.log('[OCR-MAIN] fetch', requestId, url);
    if (!requestId || !url) {
      postFetchResponse(requestId || 'unknown', {
        ok: false,
        status: 0,
        error: 'fetch request missing requestId or url',
      });
      return true;
    }
    const wxApi = getWx();
    if (!wxApi || typeof wxApi.request !== 'function') {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fetch wx.request unavailable', typeof wxApi, wxApi && typeof wxApi.request);
      postFetchResponse(requestId, {
        ok: false,
        status: 0,
        error: 'wx.request is not available in this environment',
      });
      return true;
    }
    wxApi.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        // eslint-disable-next-line no-console
        console.log('[OCR-MAIN] fetch ok', requestId, res.statusCode, res.data && (res.data.byteLength || res.data.length || 0));
        postFetchResponse(requestId, {
          ok,
          status: res.statusCode,
          data: res.data,
          error: ok ? undefined : `request failed: ${res.statusCode}`,
        });
      },
      fail: (err) => {
        // eslint-disable-next-line no-console
        console.log('[OCR-MAIN] fetch fail', requestId, err && err.errMsg ? err.errMsg : err);
        postFetchResponse(requestId, {
          ok: false,
          status: 0,
          error: err && err.errMsg ? err.errMsg : String(err),
        });
      },
    });
    return true;
  };

  const postFsResponse = (requestId, payload) => {
    try {
      worker.postMessage({
        action: 'fs-response',
        requestId,
        ...payload,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fs-response failed', requestId, err && err.message ? err.message : err);
    }
  };

  const handleFsRequest = (payload) => {
    if (!payload || !payload.action || !payload.action.startsWith('fs-')) return false;
    const { requestId, path, data } = payload;
    const wxApi = getWx();
    if (!requestId) {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fs missing requestId', payload && payload.action);
      postFsResponse('unknown', { ok: false, error: 'missing requestId' });
      return true;
    }
    if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fs unavailable', payload.action);
      postFsResponse(requestId, { ok: false, error: 'wx.getFileSystemManager is not available' });
      return true;
    }
    const fs = wxApi.getFileSystemManager();
    const filePath = resolveCachePath(path);
    // eslint-disable-next-line no-console
    console.log('[OCR-MAIN] fs', payload.action, filePath);

    if (payload.action === 'fs-read') {
      fs.readFile({
        filePath,
        success: ({ data: fileData }) => {
          // eslint-disable-next-line no-console
          console.log('[OCR-MAIN] fs-read ok', filePath, fileData && (fileData.byteLength || fileData.length || 0));
          postFsResponse(requestId, { ok: true, data: fileData });
        },
        fail: (err) => {
          // eslint-disable-next-line no-console
          console.log('[OCR-MAIN] fs-read miss', filePath, err && err.errMsg ? err.errMsg : err);
          postFsResponse(requestId, { ok: false, error: err && err.errMsg ? err.errMsg : String(err) });
        },
      });
      return true;
    }

    if (payload.action === 'fs-write') {
      const buffer = normalizeWriteBuffer(data);
      ensureDir(filePath).then(() => {
        fs.writeFile({
          filePath,
          data: buffer,
          success: () => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-write ok', filePath, buffer && (buffer.byteLength || buffer.length || 0));
            postFsResponse(requestId, { ok: true });
          },
          fail: (err) => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-write fail', filePath, err && err.errMsg ? err.errMsg : err);
            postFsResponse(requestId, { ok: false, error: err && err.errMsg ? err.errMsg : String(err) });
          },
        });
      });
      return true;
    }

    if (payload.action === 'fs-delete') {
      fs.unlink({
        filePath,
        success: () => {
          // eslint-disable-next-line no-console
          console.log('[OCR-MAIN] fs-delete ok', filePath);
          postFsResponse(requestId, { ok: true });
        },
        fail: (err) => {
          // eslint-disable-next-line no-console
          console.log('[OCR-MAIN] fs-delete fail', filePath, err && err.errMsg ? err.errMsg : err);
          postFsResponse(requestId, { ok: false, error: err && err.errMsg ? err.errMsg : String(err) });
        },
      });
      return true;
    }

    if (payload.action === 'fs-check') {
      if (typeof fs.access === 'function') {
        fs.access({
          path: filePath,
          success: () => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-check hit', filePath);
            postFsResponse(requestId, { ok: true, exists: true });
          },
          fail: () => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-check miss', filePath);
            postFsResponse(requestId, { ok: true, exists: false });
          },
        });
      } else {
        fs.readFile({
          filePath,
          success: () => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-check hit', filePath);
            postFsResponse(requestId, { ok: true, exists: true });
          },
          fail: () => {
            // eslint-disable-next-line no-console
            console.log('[OCR-MAIN] fs-check miss', filePath);
            postFsResponse(requestId, { ok: true, exists: false });
          },
        });
      }
      return true;
    }

    postFsResponse(requestId, { ok: false, error: `unknown fs action: ${payload.action}` });
    return true;
  };

  onMessage(worker, (payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (payload.action === 'fetch-ack') {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] fetch-ack', payload.requestId, payload.ok, payload.status, payload.type || '', payload.ctor || '', payload.byteLength || 0, payload.error || '');
      return;
    }
    if (payload.action === 'image-info') {
      // eslint-disable-next-line no-console
      console.log('[OCR-MAIN] image-info', payload.data || payload.error || '');
      return;
    }
    if (handleFsRequest(payload)) return;
    if (handleFetchRequest(payload)) return;
    const {
      workerId, jobId, status, action, data,
    } = payload;
    if (!action || typeof jobId === 'undefined') {
      log('unknown message', payload);
      return;
    }
    const promiseId = `${action}-${jobId}`;
    const promise = promises[promiseId];
    if (!promise) {
      log('unknown job', promiseId);
      return;
    }
    if (status === 'resolve') {
      log(`[${workerId}]: Complete ${jobId}`);
      promise.resolve({ jobId, data });
      delete promises[promiseId];
    } else if (status === 'reject') {
      promise.reject(data);
      delete promises[promiseId];
      if (action === 'load') workerResReject(data);
      if (errorHandler) {
        errorHandler(data);
      } else {
        throw Error(data);
      }
    } else if (status === 'progress') {
      logger({ ...data, userJobId: jobId });
    }
  });

  const resolveObj = {
    id,
    worker,
    load,
    writeText,
    readText,
    removeFile,
    FS,
    reinitialize,
    setParameters,
    recognize,
    detect,
    terminate,
  };

  loadInternal()
    .then(() => loadLanguageInternal(langs))
    .then(() => initializeInternal(langs, oem, config))
    .then(() => workerResResolve(resolveObj))
    .catch(() => {});

  return workerRes;
};
