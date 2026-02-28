# Movie Compress（中文说明）

一个基于 FFmpeg WASM 的纯前端视频压缩工具。

## 快速开始

1. 启动本地服务：

```bash
sh start.sh
```

2. 浏览器打开：

`http://127.0.0.1:9003/compress/movie_compress.html`

## 说明

- 全程浏览器内处理，视频不会上传后端。
- 当前使用 `@ffmpeg/core-mt` 多线程核心。
- 多线程需要 COOP/COEP 响应头，`serve_coi.py` 已内置。
