// Local production-path smoke server. Build first; this serves files without Next's runtime.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('out');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!path.startsWith('/DitherIT/')) { response.writeHead(404).end(); return; }
    let file = resolve(root, path.slice('/DitherIT/'.length) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); }
    catch { if (!extname(file)) file += '.html'; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Static output: http://127.0.0.1:4173/DitherIT/'));
