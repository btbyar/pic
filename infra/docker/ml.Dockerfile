# syntax=docker/dockerfile:1.7
FROM python:3.11-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.12.14 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    ML_MODELS_DIR=/app/models

WORKDIR /app

COPY services/ml/pyproject.toml services/ml/uv.lock services/ml/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

COPY services/ml/app ./app

ENV PATH="/app/.venv/bin:$PATH"

# Моделийг build үед татаж SHA-256-аар шалгана — ажиллах үед интернэт шаардахгүй
RUN python -m app.models

EXPOSE 8000
# OpenCV-ийн модель thread-safe биш тул зэрэгцээ ажиллахыг процессын тоогоор (ML_WORKERS) өсгөнө
ENV ML_WORKERS=2
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${ML_WORKERS}"]
