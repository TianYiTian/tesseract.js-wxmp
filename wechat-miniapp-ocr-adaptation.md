# 微信小程序适配 tesseract.js（LSTM + .wasm）改动清单

目标：在微信小程序里使用 **`tesseract-core-lstm.js` + `tesseract-core-lstm.wasm`** 的瘦身方案（B 方案），避免大体积 `.wasm.js`，并对小程序运行时不兼容点做适配。

---

## 核心选择（必须明确）

- **只使用 LSTM 引擎**：`OEM.LSTM_ONLY`  
- **仅携带 LSTM core 文件**（最小体积）：
  - `tesseract-core-lstm.js`
  - `tesseract-core-lstm.wasm`

> 说明：如需 SIMD/relaxedsimd 自动选择，则需额外带对应文件（体积增加），本清单默认“只保留 LSTM 单版本”。

---

## 需要新增的文件（建议新增，不直接改 node_modules）

1) **小程序 Worker 入口脚本**（替代浏览器 worker）
   - 作用：转发 `postMessage`/`onMessage`，注册 tesseract.js worker 脚本逻辑
   - 典型路径示例：`src/miniapp/worker/ocr-worker.js`

2) **WXWebAssembly Core Loader**
   - 作用：改写 `getCore`，用 `WXWebAssembly` 加载 `.wasm`
   - 典型路径示例：`src/miniapp/worker/getCore-wx.js`
   - 固定指向 `tesseract-core-lstm.js` + `tesseract-core-lstm.wasm(.br)`

3) **小程序 Worker 适配层（主线程）**
   - 作用：封装 `wx.createWorker`，适配 tesseract.js 的 worker 调用方式
   - 典型路径示例：`src/miniapp/worker/createWorker-wx.js`

---

## 需要修改/替换的 tesseract.js 逻辑点（列表化）

以下路径为 tesseract.js 7.0.0 源码位置（用于定位逻辑点）：

1) **Worker 创建与消息通道**
   - 原文件：
     - `node_modules/tesseract.js/src/worker/browser/spawnWorker.js`
     - `node_modules/tesseract.js/src/worker/browser/onMessage.js`
     - `node_modules/tesseract.js/src/worker/browser/terminateWorker.js`
   - 需要做的事：
     - 用 `wx.createWorker` 代替 `new Worker`
     - 用 `worker.onMessage` 代替 `onmessage`
     - `worker.terminate()` 仍可用
   - 建议方式：
     - 不直接改 node_modules，在项目里做一层适配（新增文件）

2) **Core 加载逻辑（核心改动）**
   - 原文件：
     - `node_modules/tesseract.js/src/worker-script/browser/getCore.js`
   - 需要做的事：
     - 去掉 `importScripts` + 标准 `WebAssembly`
     - 改为 `WXWebAssembly` 加载本地 `.wasm`
     - **固定选择 LSTM core**（不做 SIMD/relaxedsimd 自动选择）

3) **语言包下载/缓存**
   - 原文件：
     - `node_modules/tesseract.js/src/worker-script/index.js`（`loadLanguage` 中直接 `fetch`）
     - `node_modules/tesseract.js/src/worker-script/browser/cache.js`（IndexedDB）
   - 需要做的事：
     - `fetch` 替换为 `wx.request` 或 `wx.downloadFile` 的封装
     - 缓存改成 `wx.getFileSystemManager` 或直接禁用（no-op）

4) **默认 workerPath**
   - 原文件：
     - `node_modules/tesseract.js/src/worker/browser/defaultOptions.js`
   - 需要做的事：
     - 替换为你的包内 worker 脚本路径

---

## 资源放置建议（小程序包内）

推荐目录结构（示例）：

- `miniprogram/static/ocr/`
  - `core/`
    - `tesseract-core-lstm.js`
    - `tesseract-core-lstm.wasm`
  - `worker/ocr-worker.js`
  - `worker/getCore-wx.js`

> 注意：`.wasm` 不能放在 worker 目录内，需放到包内普通目录。

---

## 最小可运行清单（仅 LSTM）

必须有：
- `tesseract-core-lstm.js`
- `tesseract-core-lstm.wasm`
- wx worker 入口脚本（放在 `/static/ocr/worker`）
- wx getCore loader（放在 `/static/ocr/worker`）
- wx worker 创建适配（主线程）

---

## 不走 npm 的 worker 打包（单文件）

如果小程序不支持 `miniprogram_npm`，需要把 worker 打成单文件并复制到小程序包内。

在 tesseract.js 项目执行：
```bash
npm run build:miniapp-worker
```

生成的文件：
- `dist/miniapp/ocr-worker.js`

把它放到小程序包内：
- `/static/ocr/worker/ocr-worker.js`

---

## 不走 npm 的主线程打包（miniapp 入口）

如果主线程也不能使用 `miniprogram_npm`，可以把 `tesseract.js/miniapp` 打成单文件并拷到项目源码中。

在 tesseract.js 项目执行：
```bash
npm run build:miniapp-main
```

生成的文件：
- `dist/miniapp/tesseract-miniapp.js`

把它放到 uni-app 项目源码内（例如）：
- `utils/tesseract-miniapp.js`

可选（提升兼容性/性能）：
- `tesseract-core-simd-lstm.*` / `tesseract-core-relaxedsimd-lstm.*`
- 如果不嫌分包麻烦，也可以直接把 LSTM 的 **6 个文件**都包含，原因是：tesseract.js 会按设备能力在三种 LSTM core 间自动择优（`lstm` / `simd-lstm` / `relaxedsimd-lstm`），每种 core 由 **1 个 `.js` + 1 个 `.wasm(.br)`** 组成，所以合计 3×2=6 个文件。
  - `tesseract-core-lstm.js`
  - `tesseract-core-lstm.wasm`
  - `tesseract-core-simd-lstm.js`
  - `tesseract-core-simd-lstm.wasm`
  - `tesseract-core-relaxedsimd-lstm.js`
  - `tesseract-core-relaxedsimd-lstm.wasm`
- 语言包缓存策略（避免每次下载）

---

## 性能说明（B 方案）

- **识别速度本身不因 B 方案下降**  
  只要 core 相同（LSTM），识别阶段性能一致。
- 如果只保留非 SIMD LSTM，则在支持 SIMD 的设备上会慢一些。
