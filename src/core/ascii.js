/**
 * ASCII snapshot — how the AI sees what it drew.
 *
 * An AI driving this engine has no eye, so the log alone leaves it reasoning
 * about geometry it cannot picture. Rendering the lattice as text at quadrant
 * resolution closes that gap: two characters per cell, real Excel headers, and
 * colliding quadrants marked, so the AI can read its own drawing back and spot
 * structurally what the findings describe numerically.
 */

import { rect, right, bottom, quadKey } from './geometry.js';
import { indexToCol, quadToAddress } from './address.js';
import { elementsOf, elementClaimed, elementVisual, contentBounds } from './document.js';
import { cornerCutQuads } from './shapes.js';

const EMPTY = '·';
const COLLISION = '✗';

const JUNCTION_GLYPHS = Object.freeze({
  'bottom+right': '┌', 'bottom+left': '┐', 'right+top': '└', 'left+top': '┘',
  'bottom+top': '│', 'left+right': '─',
});

/**
 * @param {object} doc
 * @param {object} opts { page, region, maxCells, findings }
 * @returns {{text:string, legend:Array, region:object}}
 */
export function renderAscii(doc, { page = null, region = null, maxCells = 90, findings = null } = {}) {
  const pages = page ? doc.pages.filter((p) => p.id === page) : [...doc.pages].sort((a, b) => a.z - b.z);
  if (!pages.length) throw new Error(`no such page "${page}"`);

  const r = region ?? autoRegion(doc, page, maxCells);
  const grid = [];
  for (let y = 0; y < r.h; y++) grid.push(new Array(r.w).fill(EMPTY));

  const legend = [];
  let keyIndex = 0;

  // Lower z first, so higher pages visibly win the cell — matching render order.
  for (const p of pages) {
    for (const el of elementsOf(doc, p.id)) {
      if (el.kind === 'path') {
        for (const piece of el.pieces) put(grid, r, piece.x, piece.y, glyphForPiece(piece));
        legend.push({ key: '│─┌┐▶╪', id: el.id, kind: 'path', page: p.id });
        continue;
      }
      const key = keyFor(keyIndex++);
      const cuts = el.kind === 'box' ? cornerCutQuads(el.rect, el.corner) : new Set();
      for (const k of elementClaimed(el)) {
        const [x, y] = k.split(',').map(Number);
        put(grid, r, x, y, cuts.has(k) ? key.toLowerCase() : key);
      }
      legend.push({ key, id: el.id, kind: el.kind, page: p.id, label: el.label ?? el.text ?? '' });
    }
  }

  if (findings) {
    for (const f of findings) {
      for (const addr of f.cells) {
        const q = addressToQuad(addr);
        if (q) put(grid, r, q.x, q.y, COLLISION);
      }
    }
  }

  return { text: frame(grid, r, legend), legend, region: r };
}

const ARROW_GLYPHS = Object.freeze({ up: '▲', down: '▼', left: '◀', right: '▶' });

function glyphForPiece(piece) {
  // A mark has no direction — it is one quadrant of a computed shape, so it is
  // drawn as a solid cell rather than as a length of line.
  if (piece.type === 'mark') return '█';
  if (piece.type === 'arrow') return ARROW_GLYPHS[piece.dir] ?? '▶';
  if (piece.type === 'hop') return piece.dir === 'up' || piece.dir === 'down' ? '╫' : '╪';
  if (piece.type === 'corner') {
    const k = [...piece.sides].sort().join('+');
    return JUNCTION_GLYPHS[k] ?? JUNCTION_GLYPHS[[...piece.sides].reverse().sort().join('+')] ?? '┼';
  }
  return piece.dir === 'up' || piece.dir === 'down' ? '│' : '─';
}

function put(grid, r, x, y, ch) {
  const gx = x - r.x, gy = y - r.y;
  if (gx < 0 || gy < 0 || gx >= r.w || gy >= r.h) return;
  grid[gy][gx] = ch;
}

function keyFor(i) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[i % letters.length];
}

function addressToQuad(addr) {
  const m = /^([A-Za-z]+)(\d+)(?:\.(q[1-4]))?$/.exec(addr);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  col -= 1;
  const row = Number(m[2]) - 1;
  const q = m[3] ?? 'q1';
  const dx = q === 'q2' || q === 'q4' ? 1 : 0;
  const dy = q === 'q3' || q === 'q4' ? 1 : 0;
  return { x: col * 2 + dx, y: row * 2 + dy };
}

function autoRegion(doc, page, maxCells) {
  const b = contentBounds(doc, page);
  if (!b) return rect(0, 0, 24, 16);
  const pad = 2;
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
  const w = Math.min(b.w + pad * 2 + (b.x - x ? 0 : pad), maxCells * 2);
  const h = Math.min(b.h + pad * 2, maxCells * 2);
  return rect(x, y, w, h);
}

function frame(grid, r, legend) {
  const gutter = 5;
  const lines = [];

  // Column header: one cell label per two quadrant columns.
  let header = ' '.repeat(gutter);
  for (let x = r.x; x < right(r); x += 2) {
    const label = indexToCol(Math.floor(x / 2));
    header += label.length >= 2 ? label.slice(-2) : label.padEnd(2, ' ');
  }
  lines.push(header);

  for (let gy = 0; gy < r.h; gy++) {
    const y = r.y + gy;
    const isCellTop = y % 2 === 0;
    const label = isCellTop ? String(Math.floor(y / 2) + 1).padStart(gutter - 1, ' ') + ' ' : ' '.repeat(gutter);
    lines.push(label + grid[gy].join(''));
  }

  if (legend.length) {
    lines.push('');
    lines.push('legend:');
    const seen = new Set();
    for (const item of legend) {
      const sig = `${item.key}|${item.id}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const label = item.label ? `  "${truncate(item.label, 28)}"` : '';
      lines.push(`  ${item.key.padEnd(7)} ${item.id.padEnd(14)} ${item.kind.padEnd(5)} page:${item.page}${label}`);
    }
    lines.push(`  ${EMPTY.padEnd(7)} empty          ${COLLISION} collision   lowercase = cut corner (claimed, not inked)`);
  }
  lines.push('');
  lines.push(`region ${quadToAddress(r.x, r.y)} .. ${quadToAddress(right(r) - 1, bottom(r) - 1)}  (${r.w / 2} x ${r.h / 2} cells, 2 chars per cell)`);
  return lines.join('\n');
}

function truncate(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
