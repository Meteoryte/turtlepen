/**
 * The figure itself, in quadrants, independent of how it gets inked.
 *
 * The cartoon and the colouring page are the SAME construction drawn with
 * different pens — one at speed with a few heavy marks, the other slowly with
 * an even outline and nothing filled in. Keeping the geometry in one place is
 * the honest way to say that: they are two takes on a subject, not two
 * unrelated drawings that happen to share a name.
 *
 * Coordinates are absolute quadrants at the scale the sheet is drawn — around
 * 400 wide. Every part is a function of that so the whole thing can be drawn
 * larger for finer curves without re-deriving a single number.
 */
import { ellipse, curveOf } from './_lib.js';

export function figure({ cx = 200, top = 40, unit = 1, bottom = 500, turn = 0.2 } = {}) {
  const u = (n) => Math.round(n * unit);

  // THE TURN. Everything below is built around it, because a mirror-symmetric
  // portrait reads as "a face" and never as a particular one. She is rotated a
  // little toward the viewer's left: the features shift with her, the far cheek
  // narrows, and the near side of the hair carries more mass.
  //
  // `turn` is a fraction of the head's half-width, so the whole construction
  // still scales from one number.
  const shift = (k = 1) => Math.round(u(58) * turn * k);

  // ── Head ────────────────────────────────────────────────────────────────
  // Slightly narrower at the chin than a true ellipse: the lower half is
  // scaled in, which is what turns an egg into a face.
  const headCx = cx;
  const headCy = top + u(78);
  const headRx = u(58);
  const headRy = u(76);
  const head = ellipse(headCx, headCy, headRx, headRy, 36).map((p) => {
    // Taper toward the chin: an ellipse is an egg, a jaw is not.
    const chin = p.y > headCy
      ? { x: Math.round(headCx + (p.x - headCx) * (1 - 0.28 * ((p.y - headCy) / headRy))), y: p.y }
      : { ...p };
    // Then compress the FAR side. The far cheek of a turned head covers less
    // ground than the near one, and that difference is most of the turn.
    const far = chin.x > headCx ? 1 - 0.16 : 1;
    return { x: Math.round(headCx + (chin.x - headCx) * far + shift(0.35)), y: chin.y };
  });

  // ── Hair and veil ───────────────────────────────────────────────────────
  // Parted at the centre, falling outside the jaw on both sides, with the
  // veil sitting a little proud of the hairline.
  const hairL = curveOf([
    { x: headCx - u(4), y: headCy - headRy - u(4) },
    { x: headCx - u(46), y: headCy - u(58) },
    { x: headCx - u(70), y: headCy - u(6) },
    { x: headCx - u(76), y: headCy + u(70) },
    { x: headCx - u(66), y: headCy + u(128) },
  ]);
  const hairR = curveOf([
    { x: headCx + u(4), y: headCy - headRy - u(4) },
    { x: headCx + u(46), y: headCy - u(58) },
    { x: headCx + u(70), y: headCy - u(6) },
    { x: headCx + u(76), y: headCy + u(70) },
    { x: headCx + u(66), y: headCy + u(128) },
  ]);
  const veil = curveOf([
    { x: headCx - u(74), y: headCy - u(14) },
    { x: headCx - u(40), y: headCy - headRy - u(14) },
    { x: headCx, y: headCy - headRy - u(20) },
    { x: headCx + u(40), y: headCy - headRy - u(14) },
    { x: headCx + u(74), y: headCy - u(14) },
  ]);

  // ── Features ────────────────────────────────────────────────────────────
  // An eye is a LID over a ball, not a closed oval. Drawing it as one ellipse
  // with a circle inside produced a pair of goggles: two concentric rings that
  // read as targets. The upper lid is the heavy curve and does nearly all the
  // work; the lower is shallower and stops short of the inner corner.
  const eyeY = headCy - u(12);
  const eyeDx = u(24);

  const eyeAt = (dx, scale) => {
    const ex = headCx + dx + shift(0.9);
    const w = Math.round(u(15) * scale);
    return {
      upper: curveOf([
        { x: ex - w, y: eyeY + u(2) },
        { x: ex - Math.round(w * 0.4), y: eyeY - u(7) },
        { x: ex + Math.round(w * 0.35), y: eyeY - u(6) },
        { x: ex + w, y: eyeY + u(2) },
      ]),
      lower: curveOf([
        { x: ex - Math.round(w * 0.8), y: eyeY + u(3) },
        { x: ex, y: eyeY + u(6) },
        { x: ex + Math.round(w * 0.8), y: eyeY + u(2) },
      ]),
      iris: { x: ex + shift(0.25), y: eyeY, r: Math.round(u(6) * scale) },
    };
  };
  // The far eye is foreshortened. Equal eyes on a turned head undo the turn.
  const eyeL = eyeAt(-eyeDx, 1);
  const eyeR = eyeAt(eyeDx, 0.82);

  // Brows: low and level, which is most of why she reads as calm.
  const browL = curveOf([
    { x: headCx - u(40) + shift(0.9), y: eyeY - u(17) },
    { x: headCx - u(24) + shift(0.9), y: eyeY - u(23) },
    { x: headCx - u(9) + shift(0.9), y: eyeY - u(18) },
  ]);
  const browR = curveOf([
    { x: headCx + u(10) + shift(0.9), y: eyeY - u(18) },
    { x: headCx + u(23) + shift(0.9), y: eyeY - u(23) },
    { x: headCx + u(37) + shift(0.9), y: eyeY - u(19) },
  ]);

  // The nose turns with her: the ridge runs down the near side and the far
  // nostril is hidden, which is another quiet carrier of the pose.
  const nose = curveOf([
    { x: headCx - u(2) + shift(0.9), y: eyeY + u(4) },
    { x: headCx - u(10) + shift(0.9), y: eyeY + u(26) },
    { x: headCx - u(2) + shift(0.9), y: eyeY + u(35) },
    { x: headCx + u(9) + shift(0.9), y: eyeY + u(31) },
  ]);

  // The mouth: an upper lip with a cupid's bow, and a lower lip that lifts only
  // at the very ends. The whole reputation of this painting lives in about six
  // quadrants, and a single flat line spends none of them.
  const mouthY = headCy + u(46);
  const mouthCx = headCx + shift(0.85);
  const mouthUpper = curveOf([
    { x: mouthCx - u(24), y: mouthY - u(1) },
    { x: mouthCx - u(11), y: mouthY - u(5) },
    { x: mouthCx - u(3), y: mouthY - u(2) },
    { x: mouthCx + u(4), y: mouthY - u(5) },
    { x: mouthCx + u(15), y: mouthY - u(3) },
    { x: mouthCx + u(23), y: mouthY - u(1) },
  ]);
  const mouthLower = curveOf([
    { x: mouthCx - u(22), y: mouthY + u(1) },
    { x: mouthCx - u(8), y: mouthY + u(6) },
    { x: mouthCx + u(6), y: mouthY + u(6) },
    { x: mouthCx + u(21), y: mouthY },
  ]);
  const mouth = mouthUpper;

  // ── Body ────────────────────────────────────────────────────────────────
  const shoulderY = headCy + headRy + u(30);
  const neck = [
    { x: headCx - u(20), y: headCy + u(66) },
    { x: headCx - u(24), y: shoulderY - u(6) },
  ];
  const neckR = [
    { x: headCx + u(20), y: headCy + u(66) },
    { x: headCx + u(24), y: shoulderY - u(6) },
  ];
  const shoulders = curveOf([
    { x: headCx - u(150), y: bottom },
    { x: headCx - u(128), y: shoulderY + u(120) },
    { x: headCx - u(96), y: shoulderY + u(30) },
    { x: headCx - u(58), y: shoulderY - u(4) },
    { x: headCx, y: shoulderY + u(6) },
    { x: headCx + u(58), y: shoulderY - u(4) },
    { x: headCx + u(96), y: shoulderY + u(30) },
    { x: headCx + u(128), y: shoulderY + u(120) },
    { x: headCx + u(150), y: bottom },
  ]);
  // The square neckline of the dress.
  const neckline = curveOf([
    { x: headCx - u(56), y: shoulderY + u(4) },
    { x: headCx - u(30), y: shoulderY + u(40) },
    { x: headCx, y: shoulderY + u(48) },
    { x: headCx + u(30), y: shoulderY + u(40) },
    { x: headCx + u(56), y: shoulderY + u(4) },
  ]);

  // ── Hands, folded — the second thing anyone looks at ────────────────────
  // The first pass drew one arc and four scratches, which reads as nothing.
  // Two hands: the near one lies ACROSS the far one, four fingers visible on
  // the top hand and the far hand showing only its knuckles behind.
  const handY = shoulderY + u(104);
  const handCx = headCx + u(6);

  // Forearm coming in from the right, resting on the chair arm.
  const forearm = curveOf([
    { x: headCx + u(126), y: handY + u(54) },
    { x: headCx + u(76), y: handY + u(16) },
    { x: handCx + u(28), y: handY + u(10) },
  ]);

  // Far hand: a low mound behind, only its back showing.
  const handFar = curveOf([
    { x: handCx - u(44), y: handY + u(30) },
    { x: handCx - u(12), y: handY + u(12) },
    { x: handCx + u(26), y: handY + u(14) },
    { x: handCx + u(52), y: handY + u(30) },
  ]);

  // Near hand: laid across, wrist at the right, fingers reaching left.
  const handNear = curveOf([
    { x: handCx + u(56), y: handY + u(40) },
    { x: handCx + u(30), y: handY + u(22) },
    { x: handCx - u(10), y: handY + u(22) },
    { x: handCx - u(46), y: handY + u(36) },
    { x: handCx - u(52), y: handY + u(52) },
  ]);

  // Four fingers on the near hand, shortening toward the little finger.
  const fingers = [0, 1, 2, 3].map((i) => curveOf([
    { x: handCx - u(38 - i * 20), y: handY + u(30 + i * 3) },
    { x: handCx - u(30 - i * 20), y: handY + u(44 + i * 2) },
    { x: handCx - u(40 - i * 20), y: handY + u(52 - i * 3) },
  ]));

  // The chair arm she rests on — a signature element, and the thing that makes
  // the hands sit on something instead of floating.
  const chairArm = curveOf([
    { x: headCx + u(150), y: handY + u(74) },
    { x: headCx + u(60), y: handY + u(60) },
    { x: handCx - u(58), y: handY + u(62) },
  ]);

  // ── Drapery: the gown was one empty bell ────────────────────────────────
  const folds = [-1, 0, 1].map((k) => curveOf([
    { x: headCx + u(k * 46) - u(10), y: shoulderY + u(52) },
    { x: headCx + u(k * 52), y: shoulderY + u(120) },
    { x: headCx + u(k * 58) + u(6), y: bottom - u(10) },
  ]));

  // The near sleeve edge, which also tells you where the arm is.
  const sleeve = curveOf([
    { x: headCx + u(74), y: shoulderY + u(20) },
    { x: headCx + u(104), y: shoulderY + u(76) },
    { x: headCx + u(112), y: handY + u(30) },
  ]);

  // ── Landscape behind her ────────────────────────────────────────────────
  const horizonY = headCy - u(6);
  const ridgeL = curveOf([
    { x: cx - u(200), y: horizonY + u(16) },
    { x: cx - u(150), y: horizonY - u(30) },
    { x: cx - u(112), y: horizonY - u(6) },
    { x: cx - u(84), y: horizonY - u(26) },
    { x: cx - u(62), y: horizonY + u(4) },
  ]);
  const ridgeR = curveOf([
    { x: cx + u(62), y: horizonY + u(4) },
    { x: cx + u(92), y: horizonY - u(34) },
    { x: cx + u(126), y: horizonY - u(8) },
    { x: cx + u(160), y: horizonY - u(38) },
    { x: cx + u(200), y: horizonY + u(10) },
  ]);
  const river = curveOf([
    { x: cx + u(200), y: horizonY + u(52) },
    { x: cx + u(140), y: horizonY + u(34) },
    { x: cx + u(104), y: horizonY + u(60) },
    { x: cx + u(76), y: horizonY + u(40) },
  ]);

  /**
   * Is this point covered by the figure? Used to clip the landscape, because
   * with no fills "behind" is only true if the hidden part is never drawn.
   * Generous by a few quadrants so a contour never touches a ridge it should
   * be occluding.
   */
  const inside = (p) => {
    const pad = u(2);
    if (p.y >= shoulderY - pad && Math.abs(p.x - headCx) < u(152) + pad) return true;
    if (p.y > headCy - headRy - u(24) - pad && p.y < shoulderY) {
      // Follow the hair rather than a bounding box: a square envelope stopped
      // the horizon well clear of her edge and left it floating in mid-air.
      const nearest = (side) => {
        let best = null;
        for (const q2 of side) if (!best || Math.abs(q2.y - p.y) < Math.abs(best.y - p.y)) best = q2;
        return best;
      };
      const l = nearest(hairL);
      const r = nearest(hairR);
      if (l && r && p.x > l.x - pad && p.x < r.x + pad) return true;
    }
    return false;
  };

  /** Half-width of the body at a given height, read off the shoulder contour. */
  const halfWidthAt = (y) => {
    let best = 0;
    for (const p of shoulders) if (Math.abs(p.y - y) <= u(8)) best = Math.max(best, Math.abs(p.x - headCx));
    return best || u(120);
  };
  const withinBody = (pts, margin = u(6)) =>
    pts.filter((p) => Math.abs(p.x - headCx) <= halfWidthAt(p.y) - margin);

  return {
    inside,
    halfWidthAt,
    withinBody,
    headCx, headCy, headRx, headRy, shoulderY, horizonY, handY, mouthY, eyeY,
    head, hairL, hairR, veil,
    eyeL, eyeR, browL, browR, nose, mouth, mouthUpper, mouthLower,
    neck, neckR, shoulders, neckline,
    forearm, handFar, handNear, fingers, chairArm, folds, sleeve,
    ridgeL, ridgeR, river,
  };
}
