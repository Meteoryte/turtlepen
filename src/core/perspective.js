/**
 * Perspective — a room and its contents projected onto the lattice.
 *
 * A flat elevation is a plane, and a plane cannot say that the stair recedes,
 * that the bins run away toward a corner, or that the ceiling is twenty feet
 * behind the wall you are looking at. A photograph of a mechanical space is a
 * PERSPECTIVE, and matching it means projecting real 3D coordinates through a
 * real camera rather than arranging rectangles that happen to look similar.
 *
 * Everything is authored in INCHES in a right-handed room frame:
 *
 *     X  rightward along the near wall
 *     Y  upward from the finished floor
 *     Z  away from the camera, into the room
 *
 * so a condenser "9 ft along the wall, 7'-6" AFF, 6 inches proud" is
 * (108, 90, 6) and needs no conversion by the person reading the drawing.
 *
 * Projection lands on floats, which the lattice cannot hold. Rounding happens
 * ONCE, at the end, and the projected depth is kept alongside so a caller can
 * sort far-to-near — the lattice has no z-buffer, so draw order is the only
 * thing that makes an occlusion read correctly.
 */

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z);
  if (!l) throw new RangeError('cannot normalise a zero-length vector — is the camera sitting on its target?');
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * A camera looking from `eyeIn` at `targetIn`, both in room inches.
 *
 * `fovDeg` is the vertical field of view. A photograph taken on a phone in a
 * cramped mechanical room is usually wide — 60-75 degrees — and using a narrow
 * lens is the quickest way to produce a picture that is geometrically correct
 * and looks nothing like the reference.
 */
export function camera({
  eyeIn, targetIn, fovDeg = 65, widthQ, heightQ, upIn = { x: 0, y: 1, z: 0 },
}) {
  if (!eyeIn || !targetIn) throw new RangeError('a camera needs eyeIn and targetIn, in room inches');
  if (!(widthQ > 0) || !(heightQ > 0)) throw new RangeError('a camera needs a positive widthQ and heightQ, in quadrants');

  const forward = norm(sub(targetIn, eyeIn));
  const right = norm(cross(forward, upIn));
  const up = cross(right, forward);
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const aspect = widthQ / heightQ;

  /** Project a room point to quadrants. Returns null when it is behind the eye. */
  const project = (p) => {
    const v = sub(p, eyeIn);
    const z = dot(v, forward);
    if (z <= 1e-6) return null;                 // behind or on the camera plane
    const ndcX = (dot(v, right) * f) / (z * aspect);
    const ndcY = (dot(v, up) * f) / z;
    return {
      x: Math.round((ndcX * 0.5 + 0.5) * widthQ),
      y: Math.round((0.5 - ndcY * 0.5) * heightQ),   // screen y grows downward
      depth: z,
    };
  };

  return { project, eyeIn, targetIn, fovDeg, widthQ, heightQ };
}

/** The eight corners of an axis-aligned box, in room inches. */
export function boxCorners({ xIn, yIn, zIn, widthIn, heightIn, depthIn }) {
  const x2 = xIn + widthIn;
  const y2 = yIn + heightIn;
  const z2 = zIn + depthIn;
  return [
    { x: xIn, y: yIn, z: zIn }, { x: x2, y: yIn, z: zIn },
    { x: x2, y: y2, z: zIn }, { x: xIn, y: y2, z: zIn },
    { x: xIn, y: yIn, z: z2 }, { x: x2, y: yIn, z: z2 },
    { x: x2, y: y2, z: z2 }, { x: xIn, y: y2, z: z2 },
  ];
}

/** The twelve edges of a box, as index pairs into boxCorners. */
export const BOX_EDGES = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 0],      // near face
  [4, 5], [5, 6], [6, 7], [7, 4],      // far face
  [0, 4], [1, 5], [2, 6], [3, 7],      // the four connecting them
]);

/**
 * Project a box to lattice segments.
 *
 * An edge with either end behind the camera is DROPPED rather than clipped.
 * Clipping a wireframe properly needs a near plane and produces a vertex the
 * author never placed; dropping it leaves an obvious hole, which is the honest
 * signal that the camera is inside the geometry.
 */
export function projectBox(cam, box) {
  const pts = boxCorners(box).map((p) => cam.project(p));
  const segments = [];
  let dropped = 0;
  for (const [a, b] of BOX_EDGES) {
    if (!pts[a] || !pts[b]) { dropped += 1; continue; }
    segments.push({ from: pts[a], to: pts[b] });
  }
  const seen = pts.filter(Boolean);
  return {
    segments,
    dropped,
    depth: seen.length ? seen.reduce((s, p) => s + p.depth, 0) / seen.length : Infinity,
  };
}

/** Project a polyline — a line set, a conduit run — to lattice segments. */
export function projectPath(cam, pointsIn) {
  const pts = pointsIn.map((p) => cam.project(p));
  const segments = [];
  let dropped = 0;
  for (let i = 1; i < pts.length; i += 1) {
    if (!pts[i - 1] || !pts[i]) { dropped += 1; continue; }
    segments.push({ from: pts[i - 1], to: pts[i] });
  }
  const seen = pts.filter(Boolean);
  return {
    segments,
    dropped,
    depth: seen.length ? seen.reduce((s, p) => s + p.depth, 0) / seen.length : Infinity,
  };
}

/**
 * The room shell: floor, ceiling and the four wall edges.
 *
 * Drawn as a box so the vanishing geometry is established by the room itself.
 * Everything placed afterwards reads against it.
 */
export function room({ widthIn, depthIn, heightIn }) {
  return { xIn: 0, yIn: 0, zIn: 0, widthIn, heightIn, depthIn };
}

/** Pen commands for a set of projected segments, clipped to the canvas. */
export function segmentProgram(segments, { widthQ, heightQ }) {
  const inside = (p) => p.x >= 0 && p.y >= 0 && p.x < widthQ && p.y < heightQ;
  const lines = [];
  for (const s of segments) {
    if (!inside(s.from) || !inside(s.to)) continue;   // off-canvas, not drawn
    if (s.from.x === s.to.x && s.from.y === s.to.y) continue;
    lines.push(`pen ${addr(s.from.x, s.from.y)}`, `ray to ${addr(s.to.x, s.to.y)}`);
  }
  return lines.join('\n');
}

function addr(x, y) {
  let v = Math.floor(x / 2) + 1;
  let s = '';
  while (v > 0) { const r = (v - 1) % 26; s = String.fromCharCode(65 + r) + s; v = Math.floor((v - 1) / 26); }
  const q = x % 2 === 0 ? (y % 2 === 0 ? 1 : 3) : (y % 2 === 0 ? 2 : 4);
  return `${s}${Math.floor(y / 2) + 1}.q${q}`;
}
