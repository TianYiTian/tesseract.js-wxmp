/* global wx */
'use strict';

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

const readCache = (path) => new Promise((resolve) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
    resolve(undefined);
    return;
  }
  const fs = wxApi.getFileSystemManager();
  const filePath = resolveCachePath(path);
  fs.readFile({
    filePath,
    success: ({ data }) => resolve(new Uint8Array(data)),
    fail: () => resolve(undefined),
  });
});

const writeCache = async (path, data) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
    throw Error('wx.getFileSystemManager is not available in this environment');
  }
  const fs = wxApi.getFileSystemManager();
  const filePath = resolveCachePath(path);
  await ensureDir(filePath);

  let buffer = data;
  if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath,
      data: buffer,
      success: resolve,
      fail: reject,
    });
  });
};

const deleteCache = (path) => new Promise((resolve) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
    resolve();
    return;
  }
  const fs = wxApi.getFileSystemManager();
  const filePath = resolveCachePath(path);
  fs.unlink({
    filePath,
    success: resolve,
    fail: resolve,
  });
});

const checkCache = (path) => readCache(path).then((data) => typeof data !== 'undefined');

module.exports = {
  readCache,
  writeCache,
  deleteCache,
  checkCache,
};
