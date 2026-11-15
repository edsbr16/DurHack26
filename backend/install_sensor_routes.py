#!/usr/bin/env python3
"""Register the sensor router without replacing the deployed main.py."""
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
importlib.import_module('sensor_routes')
source = main.read_text()
marker = 'from sensor_routes import router as sensor_router'
if marker in source:
    print('Sensor routes already registered. Restart the backend if it is not using --reload.')
    raise SystemExit(0)
parsed = ast.parse(source)
for node in ast.walk(parsed):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for deco in node.decorator_list:
            if isinstance(deco, ast.Call) and deco.args and isinstance(deco.args[0], ast.Constant):
                if deco.args[0].value in ('/api/data', '/api/artwork'):
                    raise SystemExit('An existing sensor route was found. No changes made; review it before installing.')
addition = '\n\n# Environmental sensor artwork endpoints\n' + marker + '\napp.include_router(sensor_router)\n'
updated = source.rstrip() + addition
ast.parse(updated)
backup_dir = root / '.sensor-route-backups'
backup_dir.mkdir(exist_ok=True)
backup = backup_dir / ('main-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f') + '.py')
shutil.copy2(main, backup)
main.write_text(updated)
print(f'Registered POST /api/data and GET /api/artwork. Original main.py backed up at {backup}')
print('If Uvicorn uses --reload it will reload automatically. Otherwise restart its existing service.')
