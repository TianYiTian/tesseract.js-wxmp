# 微信小程序接入指南（本仓库适配版）

> 本仓库是为微信小程序适配的 tesseract.js 版本，仅支持 LSTM core。

## 快速检查清单（3 行）

1) 基础库 >= 2.14.0，已开启 `workers`
2) `/static/ocr/core/tesseract-core-lstm.wasm.br` 已存在
3) `/static/ocr/worker/ocr-worker.js` + `/static/ocr/worker/tesseract-core-lstm.js` 已拷贝
4) 语言包默认走 jsdmirror（需要自定义再传 `langPath`）

## 环境要求

- 微信基础库版本 >= 2.14.0（仅使用 `.wasm.br`）
- 小程序必须支持 `wx.createWorker` + `WXWebAssembly`

## 目录结构建议

将资源放在小程序包内（建议在 `static/ocr`）：

```
static/ocr/
  core/
    tesseract-core-lstm.wasm.br
  worker/
    ocr-worker.js
    tesseract-core-lstm.js
```

说明：
- core 目录 **不需要** `tesseract-core-lstm.js`，只需 `.wasm.br`
- `.wasm` 已移除，仅保留 `.wasm.br`
- `worker/tesseract-core-lstm.js` 用于 worker 侧 `require`，不能放 `.wasm`
- `worker/tesseract-core-lstm.js` 可直接从本仓库 `ocr/core/tesseract-core-lstm.js` 拷贝

## 构建 tesseract.js 适配包

在本仓库根目录执行：

```
npm run build:miniapp-worker
npm run build:miniapp-main
```

产物：
- `dist/miniapp/ocr-worker.js`
- `dist/miniapp/tesseract-miniapp.js`

将产物拷贝到小程序项目：

```
cp dist/miniapp/ocr-worker.js /path/to/miniapp/static/ocr/worker/ocr-worker.js
cp dist/miniapp/tesseract-miniapp.js /path/to/miniapp/utils/tesseract-miniapp.js
```

## 小程序配置

### 1) pages.json

开启 worker 目录（uni-app）：

```json
{
  "workers": "static/ocr/worker"
}
```

### 2) 创建 worker

示例（单 worker + 双语言包 + 缓存）：

```js
import './tesseract-miniapp.js'
const Tesseract = require('./tesseract-miniapp.js')
const { createWorker, OEM } = Tesseract

const worker = await createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
  workerPath: '/static/ocr/worker/ocr-worker.js',
  // corePath 当前仅用于兼容参数，实际 wasm 路径是固定的（见下方说明）
  corePath: '/static/ocr/core',
  // 不传 langPath，默认直接使用 jsdmirror CDN（jsdelivr 镜像）
  // 缓存路径默认 tessdata（USER_DATA_PATH 下）
  logger: (msg) => {
    if (msg?.status) console.log('[OCR]', msg.status, msg.progress)
  }
})
```

## 固定资源路径说明

当前 miniapp 适配版 **固定** 使用以下路径加载 wasm（忽略 `corePath` 传参）：

```
/static/ocr/core/tesseract-core-lstm.wasm.br
```

请确保该文件存在于小程序包内对应位置。

## 缓存说明

- 语言包缓存写入 `wx.env.USER_DATA_PATH/tessdata/`
- 文件名为 `chi_sim.traineddata` / `eng.traineddata`
- 二次识别会优先读缓存，不会重复下载

## 常见问题

### 1) 为什么只能用 .wasm.br？

本仓库已移除 `.wasm` 回退路径，只保留 `.wasm.br`，以减小包体积并适配分包大小限制。

### 2) worker 里能否直接发网络请求？

当前适配版将下载请求转发到主线程处理（`wx.request`），避免 worker 环境不稳定的 `fetch` 实现。

### 3) 语言包下载地址

默认使用 jsdmirror（jsdelivr 镜像）：

```
https://cdn.jsdmirror.com/npm/@tesseract.js-data/<lang>/4.0.0_best_int
```

如需自建镜像，可在 `createWorker` 里传 `langPath`。
