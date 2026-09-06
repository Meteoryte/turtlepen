/**
 * A fighting-game sprite, posed from joint angles.
 *
 * Frames are not drawn one at a time. A fighter is a skeleton — hip, chest,
 * head, two arms, two legs — and an animation is that skeleton sampled at
 * successive angles. Drawing each frame by hand produces sprites that jitter,
 * because nothing constrains frame N+1 to share proportions with frame N; posing
 * a skeleton makes that impossible by construction, which is the same reason the
 * lattice is integer-exact.
 *
 * Limbs are drawn as tapered capsules with a dark rim, so the silhouette reads
 * at 1:1 without relying on interior detail. Fighting-game sprites are read as
 * silhouettes first — an animation is legible if you can identify the action
 * from the outline alone — so the rim is applied last, over everything.
 */

export const W = 56;
export const H = 66;

export const PAL = {
  K: '#0d0b14',   // rim / outline
  S: '#e8b98a',   // skin
  s: '#c08e63',   // skin shadow
  G: '#e6ecf5',   // gi, lit
  g: '#aab6c9',   // gi, shadow
  B: '#d93b3b',   // belt / headband
  b: '#9c2626',   // belt shadow
  H: '#241a2e',   // hair
  W: '#ffffff',   // eye white
  F: '#ffd166',   // impact flash
};

const canvas = () => Array.from({ length: H }, () => Array(W).fill('.'));
const put = (g, x, y, ch) => {
  const xi = Math.round(x); const yi = Math.round(y);
  if (yi >= 0 && yi < H && xi >= 0 && xi < W) g[yi][xi] = ch;
};
const at = (g, x, y) => (y >= 0 && y < H && x >= 0 && x < W ? g[y][x] : '.');

const rad = (deg) => (deg * Math.PI) / 180;

/** Advance from a joint by length at an angle. 0deg points down; +deg swings forward (+x). */
export function joint(from, deg, len) {
  const a = rad(deg);
  return { x: from.x + Math.sin(a) * len, y: from.y + Math.cos(a) * len };
}

/** A tapered capsule between two joints — the only limb primitive. */
function limb(g, a, b, r0, r1, ch) {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const r = r0 + (r1 - r0) * t;
    for (let dy = -Math.ceil(r); dy <= r; dy += 1) {
      for (let dx = -Math.ceil(r); dx <= r; dx += 1) {
        if (dx * dx + dy * dy <= r * r) put(g, x + dx, y + dy, ch);
      }
    }
  }
}

function disc(g, x0, y0, r, ch) {
  for (let y = Math.floor(y0 - r); y <= y0 + r; y += 1) {
    for (let x = Math.floor(x0 - r); x <= x0 + r; x += 1) {
      if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) put(g, x, y, ch);
    }
  }
}

/**
 * One silhouette pass, last.
 *
 * A rim drawn per-limb would show seams where limbs meet; drawn once over the
 * assembled figure it traces the actual outline, which is what the eye uses to
 * identify the pose.
 */
function rim(g) {
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
 * Draw the fighter from a pose.
 *
 * Angles are degrees from straight-down. The far-side limbs are drawn first and
 * in shadow tone, so depth reads without a second page.
 */
export function draw(p) {
  const g = canvas();
  const hip = { x: p.hipX, y: p.hipY };
  const chest = joint(hip, p.lean, -14);
  const neck = joint(chest, p.lean, -5);
  const head = joint(neck, p.lean + p.headTilt, -6);

  // far leg, far arm — shadow tones, drawn first so the near side overlaps them
  const fKnee = joint(hip, p.farThigh, 11);
  const fFoot = joint(fKnee, p.farShin, 11);
  limb(g, hip, fKnee, 3.4, 2.8, 'g');
  limb(g, fKnee, fFoot, 2.8, 2.2, 'g');
  disc(g, fFoot.x + 1, fFoot.y + 1, 2.4, 'g');

  const fElbow = joint(chest, p.farUpper, 9);
  const fHand = joint(fElbow, p.farFore, 9);
  limb(g, chest, fElbow, 2.8, 2.4, 'g');
  limb(g, fElbow, fHand, 2.4, 2.0, 's');
  disc(g, fHand.x, fHand.y, 2.6, 's');

  // Rim the far side BEFORE the torso covers it. A single rim at the end traces
  // only the outer silhouette, so a far arm crossing the body had no edge where
  // it met the gi and read as a detached blob of shadow tone. Rimming here and
  // then painting the torso over it leaves an edge exactly where the far limb
  // emerges, which is what makes it read as being behind the body.
  rim(g);

  // torso: gi over a belt
  limb(g, hip, chest, 5.2, 6.0, 'G');
  limb(g, { x: hip.x, y: hip.y - 1 }, { x: hip.x, y: hip.y + 2 }, 5.0, 4.6, 'B');
  limb(g, { x: hip.x, y: hip.y + 1 }, { x: hip.x, y: hip.y + 3 }, 4.8, 4.4, 'b');

  // near leg
  const nKnee = joint(hip, p.nearThigh, 11);
  const nFoot = joint(nKnee, p.nearShin, 11);
  limb(g, hip, nKnee, 3.8, 3.0, 'G');
  limb(g, nKnee, nFoot, 3.0, 2.3, 'S');
  disc(g, nFoot.x + 1, nFoot.y + 1, 2.6, 'G');

  // head, hair, headband, eye
  disc(g, head.x, head.y, 5.2, 'S');
  for (let dy = -6; dy <= -1; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      if (dx * dx + dy * dy * 1.6 <= 30) put(g, head.x + dx, head.y + dy, 'H');
    }
  }
  for (let dx = -6; dx <= 6; dx += 1) {
    if (dx * dx <= 34) { put(g, head.x + dx, head.y - 1, 'B'); put(g, head.x + dx, head.y, 'B'); }
  }
  // headband tail, trailing opposite the motion so it reads as speed
  for (let i = 0; i <= 9; i += 1) {
    const t = i / 9;
    put(g, head.x - 6 - 7 * t, head.y + 1 + p.tail * t + 2 * t * t, 'B');
    put(g, head.x - 6 - 7 * t, head.y + 2 + p.tail * t + 2 * t * t, 'b');
  }
  put(g, head.x + 2, head.y + 2, 'W');
  put(g, head.x + 3, head.y + 2, 'K');

  // near arm, last: it is the acting limb in most attacks
  const nElbow = joint(chest, p.nearUpper, 9);
  const nHand = joint(nElbow, p.nearFore, 9);
  limb(g, chest, nElbow, 3.2, 2.6, 'S');
  limb(g, nElbow, nHand, 2.6, 2.2, 'S');
  disc(g, nHand.x, nHand.y, 3.0, 'S');
  // The flash marks the ACTIVE frame's contact point, so it has to follow the
  // striking limb. Anchoring it to the hand unconditionally put the kick's
  // impact on its own knee.
  if (p.flash) {
    const at_ = p.flashAt === 'foot' ? nFoot : nHand;
    disc(g, at_.x + p.flashDx, at_.y + p.flashDy, 4.2, 'F');
  }

  return rim(g);
}

/** Rest pose. Every action is a departure from these numbers. */
export const REST = {
  hipX: 26, hipY: 34, lean: 4, headTilt: -2, tail: 0, flash: false, flashAt: 'hand', flashDx: 0, flashDy: 0,
  nearThigh: 30, nearShin: -22, farThigh: -26, farShin: 20,
  nearUpper: 28, nearFore: 62, farUpper: 20, farFore: 58,
};

export const pose = (over) => ({ ...REST, ...over });
