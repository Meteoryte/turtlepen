// The logo, rebuilt on the new primitives.
//
// Proportions first: the shell is the mass (his back is to us), the head is a
// third of its width and sits ON it rather than floating above, and the arm
// carries a pen that actually reaches the board.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { traceProgram, ellipseAt, addr, col } from './trace.mjs';

const { encodePng } = await import(
  pathToFileURL('x:/Python Projects/Home Base - Brainn.dev/03_EXPERIMENTS/TurtlePen/test/helpers/png-fixture.js').href
);

const ops = [];
const pen = (id, program, page) => ops.push({ op: 'pen', id, program, page });
const shape = (id, page, inside, x0, y0, x1, y1) => {
  const t = traceProgram(inside, x0, y0, x1, y1);
  if (!t) throw new Error(`no boundary for ${id}`);
  pen(id, t.program, page);
  return t;
};

// ---- pages: depth is Z plus opacity, not just separation -------------------
ops.push({ op: 'add_page', id: 'shade', intent: 'overlay', z: 1, opacity: 0.45 });
ops.push({ op: 'add_page', id: 'body', intent: 'overlay', z: 2 });
ops.push({ op: 'add_page', id: 'detail', intent: 'overlay', z: 3 });

// ---- the easel, furthest back ----------------------------------------------
ops.push({
  op: 'place_box', id: 'board', at: `${addr(48, 5)}.tl`, span: '36x22',
  label: 'TURTLE\nPEN', align: 'center', fontSize: 'title', corner: 'square', page: 'base',
});
pen('tray', `pen ${addr(47, 28)}.q1\nright 38 line`, 'base');
pen('leg-l', `pen ${addr(54, 28)}.q1\ndown 18 line`, 'base');
pen('leg-r', `pen ${addr(78, 28)}.q1\ndown 18 line`, 'base');
pen('brace', `pen ${addr(54, 39)}.q1\nright 24 line`, 'base');

// ---- the turtle ------------------------------------------------------------
// Shell: 40 cells across, 24 deep — the dominant mass.
const SHELL = { cx: 24, cy: 33, rx: 20, ry: 12 };
shape('shell', 'body', ellipseAt(SHELL.cx, SHELL.cy, SHELL.rx, SHELL.ry), 2, 19, 46, 47);
shape('rim', 'detail', ellipseAt(SHELL.cx, SHELL.cy, SHELL.rx - 5, SHELL.ry - 3), 2, 19, 46, 47);

// Carapace plates, now real circles rather than traced blobs. Radii are in
// quadrants, so 6 = three cells across.
pen('plate-c1', `pen ${addr(24, 26)}.q1\ncircle 6`, 'detail');
pen('plate-c2', `pen ${addr(24, 33)}.q1\ncircle 7`, 'detail');
pen('plate-c3', `pen ${addr(24, 40)}.q1\ncircle 6`, 'detail');
pen('plate-l1', `pen ${addr(15, 29)}.q1\ncircle 5`, 'detail');
pen('plate-l2', `pen ${addr(15, 37)}.q1\ncircle 5`, 'detail');
pen('plate-r1', `pen ${addr(33, 29)}.q1\ncircle 5`, 'detail');
pen('plate-r2', `pen ${addr(33, 37)}.q1\ncircle 5`, 'detail');

// Head: a third of the shell's width, sitting ON the shell, glancing back.
pen('head', `pen ${addr(16, 18)}.q1\ncircle 17`, 'body');
pen('snout', `pen ${addr(7, 22)}.q1\ncircle 7`, 'body');
pen('eye', `pen ${addr(12, 15)}.q1\ncircle 5`, 'detail');
pen('pupil', `pen ${addr(12, 15)}.q1\ndisc 2`, 'detail');
// brow: a short diagonal, which the lattice could not draw until now
pen('brow', `pen ${addr(9, 11)}.q1\ndash 6 ne`, 'detail');
// neck, joining head to shell so it no longer floats
pen('neck-l', `pen ${addr(16, 24)}.q1\nray to ${addr(18, 27)}.q1`, 'body');
pen('neck-r', `pen ${addr(21, 23)}.q1\nray to ${addr(23, 27)}.q1`, 'body');

// Feet and tail
pen('foot-l', `pen ${addr(12, 45)}.q1\ncircle 7`, 'detail');
pen('foot-r', `pen ${addr(36, 45)}.q1\ncircle 7`, 'detail');
pen('tail', `pen ${addr(24, 45)}.q1\ntriangle ${addr(27, 45)}.q1 ${addr(25, 50)}.q1`, 'detail');

// ---- the arm and the pen he is holding -------------------------------------
// The arm runs up and out to the board as one diagonal ray.
pen('arm', `pen ${addr(43, 33)}.q1\nray to ${addr(48, 27)}.q1`, 'body');
pen('hand', `pen ${addr(48, 27)}.q1\ncircle 5`, 'detail');
// THE PEN: a diagonal from the hand to the board, with a nib triangle at the
// tip and the stroke it is laying down. It meets the board BELOW the wordmark,
// so the name the logo exists to say is never covered by the mascot saying it.
pen('pen-barrel', `pen ${addr(50, 26)}.q1\nray to ${addr(57, 21)}.q1`, 'detail');
pen('pen-nib', `pen ${addr(57, 21)}.q1\ntriangle ${addr(60, 20)}.q1 ${addr(58, 23)}.q1`, 'detail');
pen('pen-stroke', `pen ${addr(60, 21)}.q1\nright 10 line`, 'detail');

// ---- morse-style accent marks, the 1-bit interface idiom -------------------
pen('mark-1', `pen ${addr(88, 8)}.q1\ndash 4 se`, 'detail');
pen('mark-2', `pen ${addr(88, 12)}.q1\ndot`, 'detail');
pen('mark-3', `pen ${addr(88, 15)}.q1\ndash 4 se`, 'detail');
pen('mark-4', `pen ${addr(3, 8)}.q1\ndash 4 sw`, 'detail');
pen('mark-5', `pen ${addr(3, 12)}.q1\ndot`, 'detail');

// ---- dithered shading: volume on the shell, at page opacity 0.45 -----------
// A vertical gradient, darker at the bottom, so the carapace reads as domed.
const W = 76, H = 44;
const s = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
    const inside = nx * nx + ny * ny <= 1;
    // Lambert-ish: lit from the upper left, so the lower right carries the tone.
    const v = inside ? Math.round(120 + 130 * Math.max(0, -(nx * 0.6 + ny * 0.8))) : 255;
    const i = (y * W + x) * 3;
    s[i] = s[i + 1] = s[i + 2] = 255 - (255 - v);
  }
}
const shadePng = 'x:/Python Projects/Home Base - Brainn.dev/03_EXPERIMENTS/TurtlePen/brand/_shade.png';
writeFileSync(shadePng, encodePng(W, H, s, { colorType: 2 }));
ops.push({
  op: 'place_image', id: 'shell-shade', at: `${addr(6, 23)}.tl`, span: '36x20',
  source: 'brand/_shade.png', mode: 'dither', page: 'shade',
});

writeFileSync('logo2-ops.json', JSON.stringify(ops, null, 1));
console.log(`${ops.length} operations`);
for (const o of ops) console.log('  ', o.id ?? o.op, o.op, o.page ?? '');
