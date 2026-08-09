// The logo, rebuilt on anchors.
//
// Every part is positioned by its RELATIONSHIP to the shell rather than by a
// coordinate worked out by hand. Change the shell and the turtle still holds
// together — which is the whole reason connectors got `pen from <id>.<face>`
// in the first place. This is that lesson applied to the half of the engine
// that had not learned it.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { traceProgram, ellipseAt, addr } from './trace.mjs';

const { encodePng } = await import(
  pathToFileURL('x:/Python Projects/Home Base - Brainn.dev/03_EXPERIMENTS/TurtlePen/test/helpers/png-fixture.js').href
);

const ops = [];
const pen = (id, program, page) => ops.push({ op: 'pen', id, program, page });

// ---- pages: Z and opacity carry depth --------------------------------------
ops.push({ op: 'add_page', id: 'shade', intent: 'overlay', z: 1, opacity: 0.4 });
ops.push({ op: 'add_page', id: 'body', intent: 'overlay', z: 2 });
ops.push({ op: 'add_page', id: 'detail', intent: 'overlay', z: 3 });

// ---- the easel, the only thing still placed by address ---------------------
ops.push({
  op: 'place_box', id: 'board', at: `${addr(50, 6)}.tl`, span: '34x20',
  label: 'TURTLE\nPEN', align: 'center', fontSize: 'title', corner: 'square', page: 'base',
});
pen('tray', `pen ${addr(49, 27)}.q1\nright 36 line`, 'base');
pen('leg-l', `pen ${addr(56, 27)}.q1\ndown 18 line`, 'base');
pen('leg-r', `pen ${addr(78, 27)}.q1\ndown 18 line`, 'base');
pen('brace', `pen ${addr(56, 38)}.q1\nright 22 line`, 'base');

// ---- the shell: the one measured thing everything else hangs off -----------
const SHELL = { cx: 24, cy: 32, rx: 19, ry: 11 };
const shell = traceProgram(ellipseAt(SHELL.cx, SHELL.cy, SHELL.rx, SHELL.ry), 2, 19, 46, 45);
pen('shell', shell.program, 'body');

// From here on, nothing computes a coordinate. Radii are in quadrants: the
// shell is 38 cells wide = 76 quadrants, so the head at radius 15 is a little
// under a third of it, and it is ANCHORED so it cannot wander off.
pen('rim', 'circle 30 at shell.C', 'detail');
pen('plate-c', 'circle 8 at shell.C', 'detail');
pen('plate-n', 'circle 7 at shell.C offset 0 -13', 'detail');
pen('plate-s', 'circle 7 at shell.C offset 0 13', 'detail');
pen('plate-w', 'circle 6 at shell.C offset -22 -8', 'detail');
pen('plate-e', 'circle 6 at shell.C offset 22 -8', 'detail');
pen('plate-sw', 'circle 6 at shell.C offset -22 8', 'detail');
pen('plate-se', 'circle 6 at shell.C offset 22 8', 'detail');

// Head: anchored to the shell's north-west shoulder, overlapping it.
pen('head', 'circle 15 at shell.N offset -22 -10', 'body');
pen('snout', 'circle 7 at head.W offset -3 4', 'body');
pen('eye', 'circle 5 at head.C offset -5 -4', 'detail');
pen('pupil', 'disc 2 at head.C offset -5 -4', 'detail');
pen('brow', 'dash 7 ne at head.C offset -10 -11', 'detail');
pen('neck-a', 'ray to shell.N at head.S offset -4 0', 'body');
pen('neck-b', 'ray to shell.N at head.S offset 4 0', 'body');

// Feet and tail, all anchored to the shell.
pen('foot-l', 'circle 7 at shell.S offset -22 0', 'detail');
pen('foot-r', 'circle 7 at shell.S offset 22 0', 'detail');
pen('tail', 'disc 4 at shell.S offset 0 4', 'detail');

// ---- the arm and the pen, anchored to the shell and the board --------------
pen('arm', `ray to ${addr(49, 26)}.q1 at shell.E offset 2 -2`, 'body');
pen('hand', `circle 5 at ${addr(49, 26)}.q1`, 'detail');
pen('pen-barrel', `pen ${addr(50, 25)}.q1\nray to ${addr(58, 20)}.q1`, 'detail');
pen('pen-nib', `pen ${addr(58, 20)}.q1\ntriangle ${addr(61, 19)}.q1 ${addr(59, 22)}.q1`, 'detail');
pen('pen-stroke', `pen ${addr(61, 20)}.q1\nright 9 line`, 'detail');

// ---- morse accents ---------------------------------------------------------
pen('mark-1', `pen ${addr(89, 7)}.q1\ndash 4 se`, 'detail');
pen('mark-2', `pen ${addr(89, 11)}.q1\ndot`, 'detail');
pen('mark-3', `pen ${addr(89, 14)}.q1\ndash 4 se`, 'detail');
pen('mark-4', `pen ${addr(3, 7)}.q1\ndash 4 sw`, 'detail');
pen('mark-5', `pen ${addr(3, 11)}.q1\ndot`, 'detail');

// ---- dithered shading ------------------------------------------------------
const W = 72, H = 42;
const s = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
    const inside = nx * nx + ny * ny <= 1;
    const v = inside ? Math.round(255 - 150 * Math.max(0, nx * 0.5 + ny * 0.85)) : 255;
    const i = (y * W + x) * 3;
    s[i] = s[i + 1] = s[i + 2] = v;
  }
}
writeFileSync('x:/Python Projects/Home Base - Brainn.dev/03_EXPERIMENTS/TurtlePen/brand/_shade.png', encodePng(W, H, s, { colorType: 2 }));
ops.push({
  op: 'place_image', id: 'shell-shade', at: `${addr(6, 22)}.tl`, span: '36x20',
  source: 'brand/_shade.png', mode: 'dither', page: 'shade',
});

writeFileSync('logo3-ops.json', JSON.stringify(ops, null, 1));
console.log(`${ops.length} operations; shell traced in ${shell.runs} runs`);
console.log(`anchored parts: ${ops.filter((o) => o.program?.includes(' at ')).length}`);
