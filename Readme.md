# Movie Compress

Browser-based video compression tool powered by FFmpeg WASM.

For Chinese documentation, see [Readme-cn.md](./file/Readme-cn.md).

<img width="1152" height="802" alt="image" src="https://github.com/user-attachments/assets/9b1d3f2d-9e08-41ed-bb61-941d97a89f69" />


## Features

- Fully client-side compression (no video upload).
- Multi-file queue processing.
- Drag-and-drop and file picker support.
- Per-file status, logs, and progress display.
- One-click engine auto-load on page open.
- Batch download for all completed outputs.
- Multi-thread FFmpeg core (`@ffmpeg/core-mt`) for better performance.

## Quick Start

1. Start local server:

```bash
sh start.sh
```

2. Open:

`http://127.0.0.1:9003/compress/movie_compress.html`

## Docker Deploy

```bash
docker compose up -d --build
```

Then open:

`http://127.0.0.1:9003/compress/movie_compress.html`

## Notes

- Runs fully in browser; videos are not uploaded to a backend.
- Uses `@ffmpeg/core-mt` and requires COOP/COEP headers.
- `serve_coi.py` already sets required headers for local development.
