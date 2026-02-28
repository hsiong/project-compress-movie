FROM python:3.12-slim

WORKDIR /app

COPY compress ./compress
COPY serve_coi.py ./serve_coi.py

EXPOSE 9003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9003/compress/movie_compress.html', timeout=3)"

CMD ["python", "serve_coi.py"]
