/* global wx, WXWebAssembly */
'use strict';

const CORE_JS_PATH = './tesseract-core-lstm.js';
const CORE_WASM_BR_PATH = '/static/ocr/core/tesseract-core-lstm.wasm.br';

const getRoot = () => {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof global !== 'undefined') return global;
  if (typeof self !== 'undefined') return self;
  return {};
};

const getWasmApi = () => {
  if (typeof WXWebAssembly !== 'undefined') return WXWebAssembly;
  if (typeof wx !== 'undefined' && wx.WXWebAssembly) return wx.WXWebAssembly;
  if (typeof global !== 'undefined' && global.WXWebAssembly) return global.WXWebAssembly;
  return undefined;
};

const resolveCorePaths = () => ({
  jsPath: CORE_JS_PATH,
  wasmBrPath: CORE_WASM_BR_PATH,
});

const loadCoreFactory = (jsPath) => {
  // Avoid bundlers (e.g. webpack) trying to resolve a miniapp absolute path at build time.
  const runtimeRequire = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require;
  const mod = runtimeRequire(jsPath);
  return mod && mod.default ? mod.default : mod;
};

const createCoreWrapper = (coreFactory, wasmBrPath) => {
  const wasmApi = getWasmApi();
  if (!wasmApi || typeof wasmApi.instantiate !== 'function') {
    throw Error('WXWebAssembly.instantiate is not available in this environment');
  }

  const instantiateWithFallback = (imports, successCallback) => {
    wasmApi.instantiate(wasmBrPath, imports)
      .then(({ instance, module }) => {
        successCallback(instance, module);
      })
      .catch(() => {
        throw Error('Failed to load wasm via WXWebAssembly (.wasm.br required, base lib >= 2.14.0)');
      });
    return {};
  };

  return (module) => coreFactory({
    ...module,
    locateFile: (path) => {
      if (path.endsWith('.wasm')) return wasmBrPath;
      return path;
    },
    instantiateWasm: instantiateWithFallback,
  });
};

module.exports = async (_lstmOnly, _corePath, res) => {
  const root = getRoot();
  if (_lstmOnly === false) {
    throw Error('Legacy core is not supported in the miniapp build');
  }
  if (typeof root.TesseractCore === 'undefined') {
    const statusText = 'loading tesseract core';
    res.progress({ status: statusText, progress: 0 });

    const wasmPaths = resolveCorePaths();
    const coreFactory = loadCoreFactory(wasmPaths.jsPath);
    if (typeof coreFactory !== 'function') {
      throw Error('Failed to load TesseractCore');
    }

    root.TesseractCore = createCoreWrapper(coreFactory, wasmPaths.wasmBrPath);
    res.progress({ status: statusText, progress: 1 });
  }

  return root.TesseractCore;
};
