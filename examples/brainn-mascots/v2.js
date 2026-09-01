/**
 * Brainn.dev mascots — VERSION 2 (frozen).
 *
 * Kept exactly as shipped so later versions can be compared against it and so
 * the regression test has a real corpus rather than only the newest drawing.
 * Do not tune this file; make a new version.
 *
 * ONE CELL IS ONE PIXEL. The first attempt at these drew a 28x28 sprite and
 * then spent four passes fighting for detail that had nowhere to live: at that
 * size a brain can only be a blob with speckles on it. The canvas is unbounded,
 * so the fix was resolution, not cleverness. These are 76x92 and the gyri are
 * actual winding sulci rather than three stripes standing in for them.
 *
 * The figure is COMPUTED, not hand-plotted. The silhouette is a lobed radial
 * function and the sulci are clipped sine paths, which means the character can
 * be re-cut at any resolution and every pose derives from one body instead of
 * being a separate drawing that has to be kept in sync.
 *
 * Two constraints carried from the tileset, both found by trying:
 * `place_box` cannot draw pixels — adjacent boxes report L007 and a sprite is
 * nothing but adjacent pixels — and a pen stroke inks ONE QUADRANT across its
 * thickness, so every run is drawn twice, `align top` and `align bottom`, or
 * the sprite comes out striped.
 *
 * Palette is the brainn.dev design system, not invented.
 *
 *   node examples/build-brainn-mascots.js          # sheet of every pose
 *   node examples/build-brainn-mascots.js peek     # one pose
 */

import * as core from '../../src/core/index.js';


export const PAL = {
  K: '#080A12', // outline / page
  C: '#1E2537', // cap board
  c: '#303A52', // cap band, edges
  B: '#7C91FF', // brain — accent
  D: '#5468C9', // sulcus, shade
  L: '#A7B4FF', // gyrus highlight
  W: '#F4F6FC', // eye white
  P: '#080A12', // pupil
  M: '#8490A7', // limbs
  m: '#6E7A90', // limb shade
  A: '#F2B84B', // tassel
  T: '#48D6C8', // signal teal
  R: '#FF7A70', // mouth / blush
};

// Wide enough for the arms and the tassel to finish. The first cut was 76 and
// clipped both hands — a canvas is a starting point, not a budget.
export const W = 100;
export const H = 96;

const canvas = () => Array.from({ length: H }, () => Array(W).fill('.'));
const put = (g, x, y, ch) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = ch; };
const at = (g, x, y) => (y >= 0 && y < H && x >= 0 && x < W ? g[y][x] : '.');
const disc = (g, x0, y0, r, ch) => {
  for (let y = Math.floor(y0 - r); y <= y0 + r; y += 1) {
    for (let x = Math.floor(x0 - r); x <= x0 + r; x += 1) {
      if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) put(g, x, y, ch);
    }
  }
};

// --- the body -------------------------------------------------------------

const CX = 50, CY = 46, RX = 33, RY = 29;

/**
 * A lobed radial boundary. Two harmonics: a slow one that gives the brain its
 * broad hemispheres, and a faster one for the bumps along the edge. This is
 * what a brain is recognised by — the outline, not the interior.
 */
function inBody(x, y) {
  const dx = (x - CX) / RX, dy = (y - CY) / RY;
  const a = Math.atan2(dy, dx);
  const wobble = 1 + 0.055 * Math.sin(a * 8) + 0.035 * Math.sin(a * 3 + 1.1);
  return dx * dx + dy * dy <= wobble * wobble;
}

/** Sulci: winding valleys, clipped to the body, thick enough to read. */
const SULCI = [
  { y: 20, amp: 3.2, freq: 0.22, phase: 0.0 },
  { y: 29, amp: 3.6, freq: 0.19, phase: 1.4 },
  { y: 38, amp: 3.0, freq: 0.24, phase: 2.6 },
  { y: 56, amp: 3.4, freq: 0.21, phase: 0.8 },
  { y: 64, amp: 3.0, freq: 0.18, phase: 2.0 },
];

function body(g, { crop = H } = {}) {
  for (let y = 0; y < Math.min(H, crop + 1); y += 1) {
    for (let x = 0; x < W; x += 1) if (inBody(x, y)) put(g, x, y, 'B');
  }
  // The longitudinal fissure, only above the face.
  for (let y = 22; y <= 38; y += 1) {
    for (const t of [0, 1]) if (at(g, CX + t, y) === 'B') put(g, CX + t, y, 'D');
  }
  for (const s of SULCI) {
    for (let x = 0; x < W; x += 1) {
      const y = Math.round(s.y + s.amp * Math.sin(x * s.freq + s.phase));
      if (Math.abs(x - CX) < 4) continue;          // do not cross the fissure
      for (const t of [0, 1]) if (at(g, x, y + t) === 'B') put(g, x, y + t, 'D');
      if (at(g, x, y - 1) === 'B') put(g, x, y - 1, 'L');   // lit crown above each valley
    }
  }
  outline(g, crop);
}

/** One-pixel dark edge wherever body meets nothing. */
function outline(g, crop = H) {
  const marks = [];
  for (let y = 0; y <= Math.min(H - 1, crop + 1); y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (at(g, x, y) !== '.') continue;
      const touches = ['B', 'D', 'L'].some((ch) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => at(g, x + dx, y + dy) === ch));
      if (touches) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) put(g, x, y, 'K');
}

// --- features -------------------------------------------------------------

function mortarboard(g) {
  const by = 12;
  // Board as a rhombus — a square seen in three-quarter view.
  for (let dy = -6; dy <= 6; dy += 1) {
    const half = Math.round((1 - Math.abs(dy) / 6) * 25);
    for (let x = CX - half; x <= CX + half; x += 1) put(g, x, by + dy, 'C');
  }
  for (let dy = -7; dy <= 7; dy += 1) {
    const half = Math.round((1 - Math.abs(dy) / 7) * 26);
    put(g, CX - half, by + dy, 'K'); put(g, CX + half, by + dy, 'K');
  }
  // A shallow rim, not a visor: three pixels following the crown.
  for (let x = CX - 15; x <= CX + 15; x += 1) {
    const d = Math.abs(x - CX) / 15;
    const top = by + 5 + Math.round(d * d * 4);
    for (let y = top; y < top + 3; y += 1) put(g, x, y, 'c');
    put(g, x, top - 1, 'K'); put(g, x, top + 3, 'K');
  }
  disc(g, CX, by, 2, 'A');                       // button
  // Tassel: cord over the board's right corner, then a hanging bob.
  for (let i = 0; i <= 26; i += 1) {
    const t = i / 26;
    put(g, Math.round(CX + 26 + 8 * t), Math.round(by - 1 + 20 * t * t), 'A');
    put(g, Math.round(CX + 27 + 8 * t), Math.round(by - 1 + 20 * t * t), 'A');
  }
  disc(g, CX + 34, by + 21, 3, 'A');
}

function face(g, { look = 0, smile = true, eyeY = 46 } = {}) {
  for (const ex of [CX - 15, CX + 15]) {
    disc(g, ex, eyeY, 7, 'K');
    disc(g, ex, eyeY, 6, 'W');
    disc(g, ex + look * 2, eyeY + 1, 3, 'P');
    disc(g, ex + look * 2 - 1, eyeY - 1, 1, 'W');   // catchlight
  }
  if (smile) {
    for (let x = CX - 7; x <= CX + 7; x += 1) {
      const y = 62 + Math.round(3 * Math.cos((x - CX) / 7 * 1.4));
      put(g, x, y, 'R'); put(g, x, y + 1, 'R');
    }
    for (const bx of [CX - 21, CX + 21]) {
      for (let dx = -3; dx <= 3; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        if (dx * dx + dy * dy * 6 <= 10) put(g, bx + dx, 59 + dy, 'R');
      }
    }
  }
}

/** A hand: palm plus three knuckles, so it reads as a hand and not a mitten. */
function hand(g, x, y, dir = 1) {
  disc(g, x, y, 4, 'M');
  for (const k of [-3, 0, 3]) disc(g, x + k * 0.9, y - 3, 1.6, 'm');
  disc(g, x - dir * 4, y + 2, 2, 'm');
}

/**
 * Anchored where the silhouette actually is at that row, not at a guessed
 * half-width — start it any further in and the limb reads as a wedge growing
 * out of the body rather than an arm hanging beside it.
 */
function arm(g, side, { lift = 0 } = {}) {
  const sy = lift ? 50 : 58;
  const dy = (sy - CY) / RY;
  const half = Math.sqrt(Math.max(0, 1 - dy * dy)) * RX;
  const sx = CX + side * (half - 1);
  const steps = 18;
  const reach = lift ? 14 : 13;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    disc(g, sx + side * reach * t, sy + (lift ? -28 * t : 16 * t), 2.3, 'M');
  }
  hand(g, sx + side * reach, sy + (lift ? -28 : 16), side);
}

function legs(g, top) {
  for (const lx of [CX - 11, CX + 11]) {
    for (let y = top; y < top + 9; y += 1) disc(g, lx, y, 3, 'M');
    for (let x = lx - 6; x <= lx + 4; x += 1) for (const dy of [9, 10, 11]) put(g, x, top + dy, 'm');
  }
}

// --- poses ----------------------------------------------------------------

export const POSES = {
  scholar() {
    const g = canvas();
    body(g); mortarboard(g); face(g);
    arm(g, -1); arm(g, +1);
    legs(g, 72);
    return g;
  },

  /** Peering over a ledge — eyes only, hands hooked over the lip. */
  peek() {
    const g = canvas();
    body(g, { crop: 60 }); mortarboard(g); face(g, { smile: false });
    for (let y = 62; y < 72; y += 1) for (let x = 0; x < W; x += 1) put(g, x, y, y < 64 ? 'K' : 'C');
    hand(g, CX - 24, 60, -1); hand(g, CX + 24, 60, +1);
    return g;
  },

  /** Around a vertical edge — genuinely occluded, glancing at what it found. */
  peekSide() {
    const g = canvas();
    body(g); mortarboard(g); face(g, { look: +1 });
    arm(g, +1);
    legs(g, 72);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x <= 14; x += 1) put(g, x, y, '.');
      for (let x = 10; x <= 14; x += 1) put(g, x, y, 'C');
      put(g, 15, y, 'c'); put(g, 16, y, 'K');
    }
    hand(g, 20, 58, -1);
    return g;
  },

  wave() {
    const g = canvas();
    body(g); mortarboard(g); face(g);
    arm(g, -1); arm(g, +1, { lift: 1 });
    legs(g, 72);
    return g;
  },

  /** Reading — it is the educated one. */
  read() {
    const g = canvas();
    body(g); mortarboard(g); face(g);
    for (let x = CX - 26; x <= CX + 26; x += 1) {
      const sag = Math.round(2 * Math.cos((x - CX) / 26 * 1.6));
      for (let y = 70 - sag; y <= 80 - sag; y += 1) {
        put(g, x, y, Math.abs(x - CX) <= 1 ? 'c' : 'W');
      }
      put(g, x, 69 - sag, 'K'); put(g, x, 81 - sag, 'K');
    }
    hand(g, CX - 28, 70, -1); hand(g, CX + 28, 70, +1);
    return g;
  },
};

// --- painting -------------------------------------------------------------

const colName = (n) => {
  let s = '', x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
};

export function paintSprite(doc, page, grid, ox, oy, prefix) {
  let strokes = 0;
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      if (!PAL[ch]) throw new Error(`${prefix} row ${y}: unknown palette key "${ch}"`);
      let len = 1;
      while (x + len < row.length && row[x + len] === ch) len += 1;
      const cell = `${colName(ox + x + 1)}${oy + y + 1}`;
      for (const band of ['top', 'bottom']) {
        core.applyPen(doc, page, `pen ${cell} align ${band} right ${len} line`, {
          id: `${prefix}-${y}-${x}-${band}`, role: 'artwork', paint: 'cells', color: PAL[ch],
        });
        strokes += 1;
      }
      x += len;
    }
  });
  return strokes;
}

