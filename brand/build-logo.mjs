import { traceProgram, ellipseAt, addr } from './trace.mjs';
import { writeFileSync } from 'node:fs';

const ops = [];
const shape = (id, page, inside, x0, y0, x1, y1) => {
  const t = traceProgram(inside, x0, y0, x1, y1);
  if (!t) throw new Error(`no boundary for ${id}`);
  ops.push({ op: 'pen', id, program: t.program, page });
  return t;
};

// ---- the turtle, seen from behind -----------------------------------------
// shell: the mass, centred at (25,29)
const shell = shape('shell', 'base', ellipseAt(25, 29, 19, 11), 4, 16, 46, 42);
// carapace inner rim
shape('rim', 'parts', ellipseAt(25, 29, 13.5, 7.5), 4, 16, 46, 42);
// vertebral plates down the centre line
shape('plate-c1', 'parts', ellipseAt(25, 22, 4.5, 2.6), 18, 18, 32, 27);
shape('plate-c2', 'parts', ellipseAt(25, 29, 5, 3), 18, 24, 32, 34);
shape('plate-c3', 'parts', ellipseAt(25, 36, 4.5, 2.6), 18, 32, 32, 40);
// costal plates
shape('plate-l1', 'parts', ellipseAt(15, 25, 3.6, 2.4), 10, 21, 20, 29);
shape('plate-l2', 'parts', ellipseAt(15, 33, 3.6, 2.4), 10, 29, 20, 37);
shape('plate-r1', 'parts', ellipseAt(35, 25, 3.6, 2.4), 30, 21, 40, 29);
shape('plate-r2', 'parts', ellipseAt(35, 33, 3.6, 2.4), 30, 29, 40, 37);

// head, turned back over his shoulder, and the snout pointing away
shape('head', 'base', ellipseAt(15, 9, 7, 5), 6, 3, 24, 16);
shape('snout', 'parts', ellipseAt(8, 11, 3, 2.2), 3, 7, 13, 15);
// the one visible eye
shape('eye', 'parts', ellipseAt(15, 7, 2.4, 2), 11, 4, 19, 11);
ops.push({ op: 'place_box', id: 'pupil', at: `${addr(15, 7)}.tl`, span: '1x1', corner: 'square', page: 'face' });

// feet and tail
shape('foot-l', 'parts', ellipseAt(15, 40, 5, 2.6), 9, 36, 21, 44);
shape('foot-r', 'parts', ellipseAt(35, 40, 5, 2.6), 29, 36, 41, 44);
shape('tail', 'parts', ellipseAt(25, 41, 2, 2.4), 22, 38, 28, 45);

// neck, and the two arms
ops.push({ op: 'pen', id: 'neck', program: `pen ${addr(14, 14)}.q1\ndown 4 line`, page: 'parts' });
ops.push({ op: 'pen', id: 'neck2', program: `pen ${addr(17, 14)}.q1\ndown 4 line`, page: 'parts' });
ops.push({
  op: 'pen', id: 'arm-far', page: 'parts',
  program: `pen ${addr(43, 26)}.q1\nright 6 line\nright corner align left top\nup 6 line`,
});
ops.push({
  op: 'pen', id: 'arm-near', page: 'parts',
  program: `pen ${addr(7, 33)}.q1\nleft 3 line\nleft corner align right bottom\ndown 5 line`,
});
shape('hand-far', 'face', ellipseAt(49, 19, 2, 1.8), 46, 16, 53, 23);
shape('hand-near', 'face', ellipseAt(4, 39, 2, 1.8), 1, 36, 8, 43);

// ---- the easel he is working at -------------------------------------------
ops.push({
  op: 'place_box', id: 'board', at: `${addr(52, 6)}.tl`, span: '34x21',
  label: 'TURTLE\nPEN', align: 'center', fontSize: 'title', corner: 'square', page: 'base',
});
ops.push({ op: 'pen', id: 'tray', program: `pen ${addr(51, 28)}.q1\nright 36 line`, page: 'parts' });
ops.push({ op: 'pen', id: 'leg-l', program: `pen ${addr(58, 28)}.q1\ndown 16 line`, page: 'parts' });
ops.push({ op: 'pen', id: 'leg-r', program: `pen ${addr(80, 28)}.q1\ndown 16 line`, page: 'parts' });
ops.push({ op: 'pen', id: 'brace', program: `pen ${addr(58, 38)}.q1\nright 22 line`, page: 'parts' });

writeFileSync('logo-ops.json', JSON.stringify(ops, null, 1));
console.log(`${ops.length} operations`);
console.log(`shell traced in ${shell.runs} runs from ${shell.start}`);
console.log('--- shell program (first 12 lines) ---');
console.log(shell.program.split('\n').slice(0, 12).join('\n'));
