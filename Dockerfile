# ── Stage 1: dependency builder ──────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# システム依存パッケージ（psycopg2 のコンパイルに必要）
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# 実行時に必要な libpq のみ（コンパイラは不要）
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 \
    && rm -rf /var/lib/apt/lists/*

# 非 root ユーザーで実行
RUN useradd -m -u 1000 appuser

WORKDIR /app

# インストール済みパッケージをコピー
COPY --from=builder /install /usr/local

# アプリケーションコードをコピー
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# 起動スクリプト
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER appuser

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
