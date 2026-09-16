# syntax=docker/dockerfile:1.7
FROM python:3.11-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.12.14 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/ml/pyproject.toml services/ml/uv.lock services/ml/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

COPY services/ml/app ./app

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
