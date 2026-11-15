#!/usr/bin/env python3
"""Register the room router without replacing the deployed main.py."""
import ast
import importlib
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent
main = root / 'main.py'
if not main.is_file():
    raise SystemExit('Run this from the deployed backend folder containing main.py.')
# Validate dependencies before touching the running app.
sys.path.insert(0, str(root))
importlib.import_module('room_routes')
source = main.read_text()
marker = 'from room_routes import router as room_router'
if marker in source:
    print('Room routes already registered. Restart the backend if it is not using --reload.')
    raise SystemExit(0)
parsed = ast.parse(source)
for node in ast.walk(parsed):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for deco in node.decorator_list:
            if isinstance(deco, ast.Call) and deco.args and isinstance(deco.args[0], ast.Constant):
                if deco.args[0].value in ('/api/rooms', '/api/rooms/join'):
                    raise SystemExit('An existing room route was found. No changes made; review it before installing.')
addition = '\n\n# Private shared artwork rooms\n' + marker + '\napp.include_router(room_router)\n'
updated = source.rstrip() + addition
ast.parse(updated)
backup_dir = root / '.room-route-backups'
backup_dir.mkdir(exist_ok=True)
backup = backup_dir / ('main-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f') + '.py')
shutil.copy2(main, backup)
main.write_text(updated)
print(f'Registered room creation, joining and room WebSockets. Original main.py backed up at {backup}')
print('If Uvicorn uses --reload it will reload automatically. Otherwise restart its existing service.')
