#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Деплой Ревизор VDS..."
echo "=========================================="

mkdir -p data backups caddy_data caddy_config

echo "📦 Сборка и запуск контейнеров..."
docker compose build server
docker compose up -d --remove-orphans

echo ""
echo "✅ Готово! Статус контейнеров:"
docker compose ps
