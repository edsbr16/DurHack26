#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  DurHack 2026 - WebRTC Camera & Audio Streaming Platform "
echo "=========================================================="

MODE="${1:-all}"
BACKEND_PORT=443

start_backend() {
  echo "==> Starting FastAPI WebRTC Backend on http://0.0.0.0:$BACKEND_PORT..."
  if [ ! -d "backend/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv backend/venv
  fi
  sudo ufw allow http
  sudo ufw allow https
  # Always sync deps: an existing venv must pick up newly added requirements.
  ./backend/venv/bin/pip install -q -r backend/requirements.txt
  cd backend
  PYTHONPATH=. ../backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT --reload --ssl-certfile /etc/letsencrypt/live/durhack26.tend-to.dev/fullchain.pem --ssl-keyfile /etc/letsencrypt/live/durhack26.tend-to.dev/privkey.pem
}

start_frontend() {
  echo "==> Starting Next.js Frontend on http://0.0.0.0:4000/DurHack26..."
  cd frontend
  if [ ! -d "node_modules" ]; then
    npm install
  fi
  npm run dev -- -H 0.0.0.0 -p 4000
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
