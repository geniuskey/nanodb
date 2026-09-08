# syntax=docker/dockerfile:1
#
# NANoDB Core single-image build. The React frontend is compiled, the backend
# dependencies are resolved from the committed uv lock, and the final runtime
# image runs the FastAPI app as a non-root user serving the built frontend from
# the same origin. Source sample data (data/samples/) is never copied into the
# image; only the application code, locked dependencies and built frontend are.
#
# Image/tool versions are the versions verified at generation time; if a build
# reveals an incompatibility, apply the minimum compatible patch only.

# --- Stage 1: build the frontend -------------------------------------------
FROM node:22.17.1-bookworm-slim AS frontend

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src/frontend ./src/frontend
# App.tsx and HomePage.tsx import the horizontal logo from the repo-root
# assets/logo/, and HomePage.tsx imports the intro video from assets/video/, so
# both must be present at the same relative depth to resolve.
COPY assets/logo ./assets/logo
COPY assets/video ./assets/video
# vite root is src/frontend and outDir is ../../dist/frontend -> /build/dist/frontend
RUN npm run build

# --- Stage 2: resolve backend dependencies with uv -------------------------
FROM python:3.12.12-slim-bookworm AS backend-deps

COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON=/usr/local/bin/python3.12 \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app
# README.md is referenced by pyproject and required to build the project wheel.
COPY pyproject.toml uv.lock README.md ./
COPY src/backend ./src/backend
# --no-editable installs the nanodb package into the venv so the runtime image
# does not need the source tree on disk.
RUN uv sync --frozen --no-dev --no-editable

# --- Stage 3: runtime ------------------------------------------------------
FROM python:3.12.12-slim-bookworm AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UPLOAD_ROOT=/data/uploads \
    FRONTEND_DIST=/app/dist/frontend

WORKDIR /app
COPY --from=backend-deps /opt/venv /opt/venv
COPY --from=frontend /build/dist/frontend /app/dist/frontend
# Alembic config and migrations run inside the same image (migrate service).
COPY alembic.ini ./
COPY alembic ./alembic

# Non-root runtime user; owns the app tree and the upload root mount point.
RUN groupadd --system nanodb \
 && useradd --system --gid nanodb --home-dir /app --shell /usr/sbin/nologin nanodb \
 && mkdir -p /data/uploads/.staging \
 && chown -R nanodb:nanodb /app /data

USER nanodb
EXPOSE 8000

CMD ["uvicorn", "nanodb.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
