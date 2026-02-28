FROM python:3.12-slim AS builder

COPY compress .
COPY serve_coi.py .

EXPOSE 9003
CMD ["python", "serve_coi.py"]