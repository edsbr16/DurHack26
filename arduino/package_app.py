#!/usr/bin/env python3
"""Build a code-only App Lab import ZIP from the files edited in VS Code."""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def package_app():
    root = Path(__file__).resolve().parent
    required = [root / p for p in ('app.yaml', 'python/main.py', 'sketch/sketch.ino', 'sketch/sketch.yaml')]
    for path in required:
        if not path.is_file():
            raise SystemExit(f'Missing required file: {path}')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    output = root / '.exports' / f'DurHack26-{stamp}.zip'
    output.parent.mkdir(exist_ok=True)
    sources = [root / 'app.yaml', root / 'README.md']
    for folder in ('python', 'sketch'):
        sources.extend(p for p in (root / folder).rglob('*')
                       if p.is_file() and not any(part.startswith('.') or part == '__pycache__'
                                                 for part in p.relative_to(root / folder).parts)
                       and p.suffix.lower() in {'.py', '.ino', '.yaml', '.yml', '.h', '.hpp', '.c', '.cpp', '.json', '.txt'})
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for path in sources:
            if path.is_file():
                archive.write(path, 'durhack26/' + path.relative_to(root).as_posix())
    print(f'App Lab update package: {output}')
    print('In Arduino App Lab: Create new App > Import App, select this ZIP, then Run.')
    print('This packages source code; it does not compile or upload to the board.')
    return output


if __name__ == '__main__':
    package_app()
