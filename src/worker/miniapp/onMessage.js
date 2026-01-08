'use strict';

const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log('[OCR-MAIN]', ...args);
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
  if (isPacket(msg)) return msg;
  if (msg && typeof msg === 'object' && Object.prototype.hasOwnProperty.call(msg, 'data')) {
    const data = msg.data;
    if (isPacket(data)) return data;
    if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'data')) {
      const inner = data.data;
      if (isPacket(inner)) return inner;
    }
    return data;
  }
  return msg;
};

module.exports = (worker, handler) => {
  if (worker && typeof worker.onMessage === 'function') {
    worker.onMessage((msg) => {
      const payload = unwrapMessage(msg);
      log('onMessage', payload && payload.action, payload && payload.jobId, payload && payload.status);
      if (payload && payload.action === 'env' && payload.data) {
        log('env', payload.data);
      }
      handler(payload);
    });
    return;
  }

  if (worker && typeof worker.onmessage === 'function') { // fallback
    worker.onmessage = (event) => { // eslint-disable-line
      const payload = event && Object.prototype.hasOwnProperty.call(event, 'data')
        ? event.data
        : event;
      log('onmessage', payload && payload.action, payload && payload.jobId, payload && payload.status);
      if (payload && payload.action === 'env' && payload.data) {
        log('env', payload.data);
      }
      handler(payload);
    };
  }
};
