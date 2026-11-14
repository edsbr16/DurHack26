#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  DurHack 2026 - WebRTC Camera & Audio Streaming Platform "
echo "=========================================================="

MODE="${1:-all}"

start_backend() {
  echo "==> Starting FastAPI WebRTC Backend on http://0.0.0.0:8000..."
  if [ ! -d "backend/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv backend/venv
    ./backend/venv/bin/pip install -r backend/requirements.txt
  fi
  cd backend
  PYTHONPATH=. ../backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
}

start_frontend() {
  echo "==> Starting Next.js Frontend on http://0.0.0.0:3000..."
  cd frontend
  if [ ! -d "node_modules" ]; then
    npm install
  fi
  npm run dev -- -H 0.0.0.0 -p 3000
}

case "$MODE" in
  backend)
    start_backend
    ;;
  frontend)
    start_frontend
    ;;
  all|*)
    echo "Launching both Backend (port 8000) and Frontend (port 3000)..."
    trap 'kill $(jobs -p) 2>/dev/null' EXIT
    start_backend &
    start_frontend &
    wait
    ;;
esac
