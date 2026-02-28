# Movie Compress

Browser-based video compression tool powered by FFmpeg WASM.

## Language

For Chinese documentation, see [Readme-cn.md](./Readme-cn.md).

## Quick Start

1. Start local server:

```bash
sh start.sh
```

2. Open:

`http://127.0.0.1:9003/compress/movie_compress.html`

## Notes

- Runs fully in browser; videos are not uploaded to a backend.
- Uses `@ffmpeg/core-mt` and requires COOP/COEP headers.
- `serve_coi.py` already sets required headers for local development.
