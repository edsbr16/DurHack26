import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../out');
const base = '/DurHack26';
const port = Number(process.env.PORT || 4002);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.txt':'text/plain; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const exists = async path => { try { return (await stat(path)).isFile(); } catch { return false; } };
if (!await exists(resolve(root, 'index.html'))) {
  console.error('Build missing. Run npm run build -- --webpack first.');
  process.exit(1);
}
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') {
      res.writeHead(302, { Location: `${base}/` }); res.end(); return;
    }
    if (pathname !== base && !pathname.startsWith(`${base}/`)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    let file = resolve(root, '.' + (pathname.slice(base.length) || '/'));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (file === root) file = resolve(root, 'index.html');
    else if (!await exists(file) && await exists(file + '.html')) file += '.html';
    else if (!await exists(file) && await exists(resolve(file, 'index.html'))) file = resolve(file, 'index.html');
    if (!await exists(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(400); res.end('Invalid request');
  }
});
server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the previous preview with Ctrl+C.` : err.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Artwork preview: http://localhost:${port}${base}/`);
  console.log('Leave this terminal running. To include later source changes, stop and run npm run preview again.');
});
