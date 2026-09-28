FROM rust:1.80-slim as builder

WORKDIR /usr/src/app

# Pre-cache dependencies for fast incremental builds
COPY Cargo.toml ./
RUN mkdir src static && \
    echo "fn main() {}" > src/main.rs && \
    touch static/zxing.min.js static/mobile.html && \
    cargo build --release && \
    rm -rf src static target/release/deps/revizor_server* target/release/revizor-server*

# Copy full source
COPY . .
RUN cargo build --release

# Minimal runtime image
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates sqlite3 curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/app/target/release/revizor-server /app/revizor-server

ENV PORT=4820
ENV DB_PATH=/opt/revizor/data/revision.db

EXPOSE 4820

CMD ["/app/revizor-server"]
