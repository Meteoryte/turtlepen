// Static server so a browser can open the rendered SVGs for screenshotting.
// Not part of the engine; it exists only to get pixels out of a vector file.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'diagrams', 'mona');
const TYPES = { '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png' };

createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(8792, '127.0.0.1', () => console.log('mona sheets on 127.0.0.1:8792'));
