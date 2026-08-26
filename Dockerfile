# Hawkeye v2 backend container image.
#
# Build:   docker build -t hawkeye-api .
# Run:     docker run -p 8000:8000 -e DATABASE_URL=... -e CORS_ORIGINS='["https://your-frontend"]' hawkeye-api
#
# IMPORTANT: run with --workers 1. WebSocket sessions, broadcast fan-out and
# reconnection history live in process memory (hawkeye/api/websocket.py);
# multiple workers would split that state across processes.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY hawkeye ./hawkeye

RUN pip install --no-cache-dir -e .

ENV API_HOST=0.0.0.0 \
    API_PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn hawkeye.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
