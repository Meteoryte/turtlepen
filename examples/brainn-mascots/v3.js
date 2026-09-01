/**
 * Brainn.dev mascots — VERSION 3.
 *
 * Two changes from v2, both asked for: bigger, and less creepy.
 *
 * SIZE. 160x168, roughly 2.9x v2's pixel count. Every version of these has been
 * limited by resolution rather than by the lattice, and each time the fix was to
 * stop economising on a canvas that is unbounded by design.
 *
 * CUTE. v2 was uncanny for one dominant reason: small pupils floating in large
 * whites. That is the face of something staring THROUGH you, and no amount of
 * blush compensates for it. The fixes, in order of how much they mattered:
 *
 *   1. Pupils fill most of the eye and sit LOW in it, which reads as looking up
 *      at the viewer rather than out past them.
 *   2. Two catchlights, a big one and a small one, so the eye looks wet.
 *   3. A small mouth. v2's ran a third of the face width and read as a grimace.
 *   4. Softer sulci: fewer valleys, more lit crowns, so the folds suggest a
 *      brain instead of looking like veins.
 *
 * WHAT THE FIRST v3 RENDER SHOWED, which no amount of reading the code would
 * have. Three defects, all of them geometry rather than detail:
 *
 *   a. The brain filled the frame edge to edge, so there was no character —
 *      just a face. It is now 94x88 in a 160x168 field, with real air around it.
 *   b. The arms left the silhouette at EYE height and ran diagonally into empty
 *      space, reading as bones. They now leave low on the body and curve down
 *      beside the legs, which is where arms are.
 *   c. The mortarboard was a flat dark diamond floating over a separate curved
 *      band. A mortarboard is a board resting on a SKULLCAP, so the cap is now
 *      taken from the silhouette itself — it cannot float, because it is the
 *      head's own top fourteen rows.
 *
 * Outlining is deferred to `finish()` and runs once over the assembled sprite,
 * so limbs, cap and props get the same silhouette the body does. Drawing the
 * outline inside `body()` was why v2's arms had none.
 */

import { paintSprite } from './paint.js';

export const VERSION = 'v3';

export const PAL = {
  K: '#080A12', C: '#1E2537', c: '#303A52',
  B: '#8FA1FF', D: '#6376D6', L: '#B9C4FF',
  W: '#FFFFFF', P: '#141A2E', p: '#2E3A63',
  M: '#96A1B5', m: '#7A8598',
  A: '#F2B84B', T: '#48D6C8', R: '#FF8E86',
};

export const W = 160;
export const H = 168;

const CX = 80, CY = 82, RX = 46, RY = 44;
const EYE_Y = CY + 6;
const CAP_Y = CY - RY - 6;          // board rests just above the skull crown
const LEG_TOP = CY + 30;

const canvas = () => Array.from({ length: H }, () => Array(W).fill('.'));
const put = (g, x, y, ch) => {
  const xi = Math.round(x);
  if (y >= 0 && y < H && xi >= 0 && xi < W) g[y][xi] = ch;
};
const at = (g, x, y) => (y >= 0 && y < H && x >= 0 && x < W ? g[y][x] : '.');
const disc = (g, x0, y0, r, ch) => {
  for (let y = Math.floor(y0 - r); y <= y0 + r; y += 1) {
    for (let x = Math.floor(x0 - r); x <= x0 + r; x += 1) {
      if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) put(g, x, y, ch);
    }
  }
};

function inBody(x, y) {
  const dx = (x - CX) / RX, dy = (y - CY) / RY;
  const a = Math.atan2(dy, dx);
  // Gentler harmonics than v2: the lobes should suggest a brain, not corrugate it.
  const wobble = 1 + 0.045 * Math.sin(a * 7) + 0.03 * Math.sin(a * 3 + 1.1);
  return dx * dx + dy * dy <= wobble * wobble;
}

/** The x half-width of the silhouette at a given row, or 0 off the body. */
function halfAt(y) {
  const dy = (y - CY) / RY;
  if (Math.abs(dy) >= 1) return 0;
  return Math.sqrt(1 - dy * dy) * RX;
}

/** Fewer, softer valleys, and only on the upper skull — never across the face. */
const SULCI = [
  { y: CY - 24, amp: 4, freq: 0.12, phase: 0.0 },
  { y: CY - 12, amp: 5, freq: 0.10, phase: 1.6 },
];

function body(g, { crop = H } = {}) {
  for (let y = 0; y < Math.min(H, crop + 1); y += 1) {
    for (let x = 0; x < W; x += 1) if (inBody(x, y)) put(g, x, y, 'B');
  }
  // Central fissure, stopped well above the eyes so it is not a seam down a face.
  for (let y = CY - 34; y <= CY - 8; y += 1) {
    for (const t of [-1, 0, 1]) if (at(g, CX + t, y) === 'B') put(g, CX + t, y, 'D');
  }
  for (const s of SULCI) {
    for (let x = 0; x < W; x += 1) {
      if (Math.abs(x - CX) < 8) continue;
      const y = Math.round(s.y + s.amp * Math.sin(x * s.freq + s.phase));
      for (const t of [0, 1]) if (at(g, x, y + t) === 'B') put(g, x, y + t, 'D');
      for (const t of [2, 3]) if (at(g, x, y + t) === 'B') put(g, x, y + t, 'L');
    }
  }
}

/**
 * One silhouette pass over the finished sprite.
 *
 * Anything that is not background and touches background gets a dark edge, so
 * every limb and prop is bounded the same way the body is. Run this LAST.
 */
function finish(g) {
  const marks = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (at(g, x, y) !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const n = at(g, x + dx, y + dy);
        return n !== '.' && n !== 'K';
      })) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) put(g, x, y, 'K');
  return g;
}

/**
 * A mortarboard is a flat board on a skullcap. The cap is cut from the body's
 * own silhouette rather than drawn as a separate arc, so it cannot float off
 * the head — which is exactly what the first v3 render did.
 */
function mortarboard(g) {
  const crown = CY - RY;
  for (let y = crown - 1; y <= crown + 9; y += 1) {
    for (let x = 0; x < W; x += 1) if (inBody(x, y)) put(g, x, y, y > crown + 7 ? 'c' : 'C');
  }

  // Board: a rhombus, which is what a square looks like from slightly below.
  const HW = 46, HH = 13;
  for (let dy = -HH; dy <= HH; dy += 1) {
    const half = Math.round(HW * (1 - Math.abs(dy) / HH));
    for (let x = CX - half; x <= CX + half; x += 1) put(g, x, CAP_Y + dy, 'C');
  }
  // Front two edges get a lit underside, so the board reads as having thickness.
  for (let dy = 1; dy <= HH; dy += 1) {
    const half = Math.round(HW * (1 - dy / HH));
    for (let t = 0; t < 3; t += 1) {
      put(g, CX - half + t, CAP_Y + dy, 'c');
      put(g, CX + half - t, CAP_Y + dy, 'c');
    }
  }
  disc(g, CX, CAP_Y, 4, 'A');
  disc(g, CX, CAP_Y, 2, 'c');

  // Tassel: off the right corner, falling with a bit of swing.
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    disc(g, CX + HW - 2 + 10 * t, CAP_Y + 2 + 46 * t * t, 2, 'A');
  }
  disc(g, CX + HW + 8, CAP_Y + 48, 6, 'A');
}

/**
 * The face that stops it being creepy.
 *
 * A big pupil low in the eye reads as looking up at you; a small one centred in
 * white reads as looking through you. Everything else here is secondary.
 */
function face(g, { look = 0, smile = true, eyeY = EYE_Y } = {}) {
  for (const ex of [CX - 23, CX + 23]) {
    const px = ex + look * 4;
    disc(g, ex, eyeY, 19, 'K');
    disc(g, ex, eyeY, 17, 'W');
    disc(g, px, eyeY + 4, 12, 'p');     // iris
    disc(g, px, eyeY + 5, 9, 'P');      // pupil
    disc(g, px - 5, eyeY - 3, 5, 'W');  // catchlight
    disc(g, px + 4, eyeY + 8, 2, 'W');  // secondary sparkle
  }
  for (const bx of [CX - 32, CX + 32]) {
    for (let dx = -7; dx <= 7; dx += 1) {
      for (let dy = -3; dy <= 3; dy += 1) {
        if (dx * dx + dy * dy * 5 <= 46 && at(g, bx + dx, eyeY + 21 + dy) === 'B') {
          put(g, bx + dx, eyeY + 21 + dy, 'R');
        }
      }
    }
  }
  if (smile) {
    // Small and high — a third of the face wide reads as a grimace.
    for (let x = CX - 11; x <= CX + 11; x += 1) {
      const y = eyeY + 24 + Math.round(5 * Math.cos((x - CX) / 11 * 1.5));
      for (const t of [0, 1, 2]) put(g, x, y + t, 'K');
    }
    for (let x = CX - 7; x <= CX + 7; x += 1) {
      const y = eyeY + 27 + Math.round(3 * Math.cos((x - CX) / 7 * 1.4));
      for (const t of [0, 1]) put(g, x, y + t, 'R');
    }
  }
}

function hand(g, x, y, dir = 1) {
  disc(g, x, y, 6, 'M');
  for (const k of [-3.6, 0, 3.6]) disc(g, x + k, y - 4, 2.2, 'm');
  disc(g, x - dir * 5, y + 2, 2.8, 'm');
}

/**
 * Arms leave the silhouette LOW and curve down beside the body.
 *
 * The first v3 attached them at eye height on the widest part of the head,
 * where they read as bones sticking out of a skull.
 */
function arm(g, side, { lift = 0 } = {}) {
  const sy = CY + 26;
  const sx = CX + side * (halfAt(sy) - 4);
  // Far enough out that the hand clears the silhouette — an arm tucked against
  // a body this round is invisible — and stopped above the feet so the hand does
  // not merge into the foot pad.
  const reach = lift ? 22 : 14;
  const drop = lift ? -58 : 16;
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // Quadratic in t, so the arm leaves the body vertically and only bows out
    // near the wrist. Linear made it a straight diagonal — a crab leg.
    disc(g, sx + side * reach * t * t, sy + drop * t, 5.5 - 1.6 * t, 'M');
  }
  hand(g, sx + side * reach, sy + drop, side);
}

/**
 * Short legs with rounded pads. The slab feet of the first v3 read as plinths;
 * anything that is meant to look young has round extremities, not flat ones.
 */
function legs(g, top = LEG_TOP) {
  for (const lx of [CX - 14, CX + 14]) {
    for (let y = top; y < top + 22; y += 1) disc(g, lx, y, 7, 'M');
    for (let dy = 0; dy <= 7; dy += 1) {
      const half = Math.round(8 * Math.sqrt(Math.max(0, 1 - (dy / 8.4) ** 2)));
      const toe = lx < CX ? -3 : 3;   // toes point outward, which reads as standing
      for (let x = Math.min(lx - half, lx - half + toe); x <= Math.max(lx + half, lx + half + toe); x += 1) {
        put(g, x, top + 21 + dy, 'm');
      }
    }
  }
}

export const POSES = {
  scholar() {
    const g = canvas();
    legs(g); arm(g, -1); arm(g, +1);
    body(g); mortarboard(g); face(g);
    return finish(g);
  },

  peek() {
    const g = canvas();
    const lip = CY + 26;
    body(g, { crop: lip }); mortarboard(g); face(g, { smile: false });
    // Clear of the eyes (which reach CX+-42) and above the lip, or the grip is
    // buried behind the face and reads as two grey smudges.
    hand(g, CX - 51, lip - 4, -1); hand(g, CX + 51, lip - 4, +1);
    for (let y = lip; y < lip + 26; y += 1) {
      for (let x = 0; x < W; x += 1) put(g, x, y, y < lip + 4 ? 'c' : 'C');
    }
    return finish(g);
  },

  /**
   * Leaning out from behind a corner. The wall must OVERLAP the character —
   * the first version put the edge at x=22 while the body starts at x=34, so
   * the wall hid nothing and stood in empty space beside a fully visible
   * brainn. The edge now cuts just left of centre, hiding one eye, and the
   * sideways glance does the rest.
   */
  peekSide() {
    const g = canvas();
    legs(g); arm(g, +1);
    body(g); mortarboard(g); face(g, { look: +1 });
    const edge = CX - 6;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x <= edge; x += 1) put(g, x, y, 'C');
      put(g, edge + 1, y, 'c');
    }
    hand(g, edge + 3, CY + 14, -1);   // drawn after the wall, so it grips it
    return finish(g);
  },

  /** The LEFT arm waves: the tassel hangs off the right corner, and a raised
   *  right arm lands exactly on it — a grey smear over the gold. */
  wave() {
    const g = canvas();
    legs(g); arm(g, +1); arm(g, -1, { lift: 1 });
    body(g); mortarboard(g); face(g);
    return finish(g);
  },

  read() {
    const g = canvas();
    legs(g);
    body(g); mortarboard(g); face(g);
    const bookY = CY + 40;
    for (let x = CX - 40; x <= CX + 40; x += 1) {
      const sag = Math.round(4 * Math.cos((x - CX) / 40 * 1.6));
      for (let y = bookY - sag; y <= bookY + 20 - sag; y += 1) {
        put(g, x, y, Math.abs(x - CX) <= 2 ? 'c' : 'W');
      }
    }
    hand(g, CX - 44, bookY + 4, -1); hand(g, CX + 44, bookY + 4, +1);
    return finish(g);
  },
};

export { paintSprite };
