# Movie Compress（中文说明）

一个基于 FFmpeg WASM 的纯前端视频压缩工具。

<img width="1152" height="802" alt="image" src="https://github.com/user-attachments/assets/9b1d3f2d-9e08-41ed-bb61-941d97a89f69" />


## 特点

- 纯前端压缩，视频不上传服务器。
- 支持多文件队列处理。
- 支持拖拽上传和文件选择。
- 支持单文件状态、日志和进度展示。
- 页面打开自动加载压缩引擎。
- 支持批量下载所有已完成文件。
- 使用多线程核心 `@ffmpeg/core-mt` 提升性能。

## 快速开始

1. 启动本地服务：

```bash
sh start.sh
```

2. 浏览器打开：

`http://127.0.0.1:9003/compress/movie_compress.html`

## Docker 部署

```bash
docker compose -f file/docker-compose.yml up -d --build
```

然后打开：

`http://127.0.0.1:9003/compress/movie_compress.html`

## 说明

- 全程浏览器内处理，视频不会上传后端。
- 当前使用 `@ffmpeg/core-mt` 多线程核心。
- 多线程需要 COOP/COEP 响应头，`serve_coi.py` 已内置。
- 访问限制：
  - 支持：`http://127.0.0.1:*`、`http://localhost:*`、受信任证书的 `https://...`。
  - 不支持多线程核心：其他 `http://...` 地址（包含局域网 IP）。
  - 不支持：自签名 HTTPS（浏览器通常视为不受信任上下文）。
