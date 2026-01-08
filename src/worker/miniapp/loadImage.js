/* global wx */
'use strict';

const isURL = (value) => /^https?:\/\//.test(value);

const getWx = () => {
  if (typeof wx !== 'undefined') return wx;
  if (typeof global !== 'undefined' && global.wx) return global.wx;
  return undefined;
};

const requestArrayBuffer = (url) => new Promise((resolve, reject) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.request !== 'function') {
    reject(Error('wx.request is not available in this environment'));
    return;
  }
  wxApi.request({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    success: (res) => resolve(res.data),
    fail: reject,
  });
});

const readLocalFile = (filePath) => new Promise((resolve, reject) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.getFileSystemManager !== 'function') {
    reject(Error('wx.getFileSystemManager is not available in this environment'));
    return;
  }
  const fs = wxApi.getFileSystemManager();
  fs.readFile({
    filePath,
    success: ({ data }) => resolve(data),
    fail: reject,
  });
});

const base64ToArrayBuffer = (base64) => {
  const wxApi = getWx();
  if (wxApi && typeof wxApi.base64ToArrayBuffer === 'function') {
    return wxApi.base64ToArrayBuffer(base64);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64');
  }
  throw Error('base64ToArrayBuffer is not available in this environment');
};

/**
 * loadImage
 *
 * @name loadImage
 * @function load image from different source
 * @access public
 */
module.exports = async (image) => {
  let data = image;
  if (typeof image === 'undefined') {
    return image;
  }

  if (typeof image === 'string') {
    // Base64 Image
    if (/data:image\/([a-zA-Z]*);base64,([^\"]*)/.test(image)) {
      data = base64ToArrayBuffer(image.split(',')[1]);
    } else if (isURL(image)) {
      data = await requestArrayBuffer(image);
    } else {
      data = await readLocalFile(image);
    }
  } else if (image instanceof ArrayBuffer) {
    data = image;
  } else if (ArrayBuffer.isView(image)) {
    data = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength);
  }

  return new Uint8Array(data);
};
