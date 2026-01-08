'use strict';

const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log('[OCR-MAIN]', ...args);
};

module.exports = (worker, message) => {
  log('postMessage', message && message.action, message && message.jobId);
  worker.postMessage(message);
};
