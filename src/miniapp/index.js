'use strict';

/**
 *
 * Entry point for WeChat miniapp usage.
 *
 * @fileoverview miniapp entry point for tesseract.js
 */
require('regenerator-runtime/runtime');
const createScheduler = require('../createScheduler');
const createWorker = require('../createWorkerWx');
const languages = require('../constants/languages');
const OEM = require('../constants/OEM');
const PSM = require('../constants/PSM');
const { setLogging } = require('../utils/log');

const recognize = async (image, langs, options) => {
  const worker = await createWorker(langs, OEM.LSTM_ONLY, options);
  return worker.recognize(image)
    .finally(async () => {
      await worker.terminate();
    });
};

const detect = async () => {
  throw Error('detect is not supported in the miniapp LSTM-only build');
};

module.exports = {
  languages,
  OEM,
  PSM,
  createScheduler,
  createWorker,
  setLogging,
  recognize,
  detect,
};
