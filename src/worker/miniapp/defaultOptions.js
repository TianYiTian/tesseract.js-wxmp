'use strict';

const defaultOptions = require('../../constants/defaultOptions');

/*
 * Default options for WeChat miniapp worker.
 * Paths assume resources are placed under /static/ocr in the miniapp package.
 */
module.exports = {
  ...defaultOptions,
  workerPath: '/static/ocr/worker/ocr-worker.js',
  corePath: '/static/ocr/core',
  cachePath: 'tessdata',
  cacheMethod: 'write',
};
