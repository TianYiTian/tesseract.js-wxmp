/* global wx */
'use strict';

const getWx = () => {
  if (typeof wx !== 'undefined') return wx;
  if (typeof global !== 'undefined' && global.wx) return global.wx;
  return undefined;
};

const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log('[OCR-MAIN]', ...args);
};

/**
 * spawnWorker
 *
 * @name spawnWorker
 * @function create a new worker in WeChat miniapp
 * @access public
 */
module.exports = ({ workerPath }) => {
  const wxApi = getWx();
  if (!wxApi || typeof wxApi.createWorker !== 'function') {
    log('wx.createWorker not available', typeof wxApi, wxApi && typeof wxApi.createWorker);
    throw Error('wx.createWorker is not available in this environment');
  }
  log('createWorker', workerPath);
  return wxApi.createWorker(workerPath);
};
