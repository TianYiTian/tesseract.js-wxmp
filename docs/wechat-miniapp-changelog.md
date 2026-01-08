# 微信小程序适配变更记录

> 本文档记录本仓库相对上游 tesseract.js 的主要改动点（面向小程序适配）。

## 核心改动

1) **仅 LSTM core**
- 固定使用 `OEM.LSTM_ONLY`
- 移除 Legacy core 逻辑

2) **仅使用 .wasm.br**
- 依赖基础库 >= 2.14.0
- `.wasm` 已移除，仅保留 `tesseract-core-lstm.wasm.br`
- wasm 路径固定为 `/static/ocr/core/tesseract-core-lstm.wasm.br`（`corePath` 仅保留兼容）

3) **WXWebAssembly 加载**
- worker 内通过 `WXWebAssembly.instantiate` 加载 wasm
- 规避标准 `WebAssembly`/`importScripts`

4) **wx worker 适配**
- `wx.createWorker` 创建 worker
- `onMessage/postMessage` 通讯适配

5) **主线程网络下载与缓存**
- worker 内部不直接发请求
- 由主线程 `wx.request` 下载语言包
- 缓存写入 `wx.env.USER_DATA_PATH/tessdata/`

6) **默认 CDN 改为 jsdmirror**
- 默认语言包使用 `https://cdn.jsdmirror.com`

## 目录/文件新增

- `scripts/webpack.config.miniapp-worker.js`
- `scripts/webpack.config.miniapp-main.js`
- `src/worker-script/miniapp/*`
- `src/worker/miniapp/*`
- `src/createWorkerWx.js`
- `miniapp.js`, `miniapp.d.ts`, `worker-script/miniapp.js`
- `docs/wechat-miniapp-setup.md`

## 资源放置约定

```
static/ocr/
  core/
    tesseract-core-lstm.wasm.br
  worker/
    ocr-worker.js
    tesseract-core-lstm.js
```

说明：core 目录不需要 `tesseract-core-lstm.js`，只需 `.wasm.br`。

## 备注

- 本仓库只关注微信小程序场景
- 若需恢复上游能力（如 Node/Web），请使用上游仓库
