/**
 * The move list.
 *
 * Each action is an array of poses. Frame counts follow fighting-game practice
 * rather than being uniform: an attack is startup, active, recovery, and the
 * ACTIVE frame is held for exactly one frame so the hit window reads as an
 * instant. An idle loops evenly; an attack does not.
 */

import { pose } from './pose.js';

// Idle — a four-frame breath. The whole loop moves the chest two pixels and the
// headband tail three. Anything larger stops reading as "waiting" and starts
// reading as "shifting weight".
export const idle = [
  pose({ hipY: 34, lean: 4, tail: 0 }),
  pose({ hipY: 33, lean: 5, tail: 1, nearUpper: 30, farUpper: 22 }),
  pose({ hipY: 34, lean: 4, tail: 2 }),
  pose({ hipY: 35, lean: 3, tail: 1, nearUpper: 26, farUpper: 18 }),
];

// Walk forward — six frames, contact / down / pass / contact / down / pass.
// The hip rises on the passing frame, which is what stops a walk looking like a
// slide.
export const walk = [
  pose({ hipY: 34, nearThigh: 34, nearShin: -20, farThigh: -30, farShin: 22, nearUpper: 10, farUpper: 44, tail: 1 }),
  pose({ hipY: 35, nearThigh: 20, nearShin: -8, farThigh: -14, farShin: 14, nearUpper: 18, farUpper: 36, tail: 2 }),
  pose({ hipY: 33, nearThigh: 4, nearShin: -2, farThigh: 6, farShin: 4, nearUpper: 26, farUpper: 26, tail: 1 }),
  pose({ hipY: 34, nearThigh: -30, nearShin: 22, farThigh: 34, farShin: -20, nearUpper: 44, farUpper: 10, tail: 0 }),
  pose({ hipY: 35, nearThigh: -14, nearShin: 14, farThigh: 20, farShin: -8, nearUpper: 36, farUpper: 18, tail: 1 }),
  pose({ hipY: 33, nearThigh: 6, nearShin: 4, farThigh: 4, farShin: -2, nearUpper: 26, farUpper: 26, tail: 2 }),
];

// Straight punch — 2 startup, 1 active, 2 recovery. The hip counter-rotates
// away from the strike so the punch has weight behind it rather than being an
// arm moving on a static body.
export const punch = [
  pose({ lean: -2, nearUpper: 44, nearFore: 88, farUpper: 8, tail: -1 }),
  pose({ lean: 2, hipX: 27, nearUpper: 70, nearFore: 92, farUpper: 26, tail: 1 }),
  pose({ lean: 10, hipX: 29, nearUpper: 92, nearFore: 90, farUpper: 40, tail: 3,
    flash: true, flashDx: 3, flashDy: 0 }),
  pose({ lean: 6, hipX: 28, nearUpper: 78, nearFore: 84, farUpper: 32, tail: 2 }),
  pose({ lean: 4, nearUpper: 40, nearFore: 70, farUpper: 22, tail: 1 }),
];

// Roundhouse kick — the chest leans back as the leg comes up, because a kick
// that keeps the torso vertical looks like the sprite is stepping over something.
export const kick = [
  pose({ lean: -4, nearThigh: 26, nearShin: -16, nearUpper: 20, tail: -1 }),
  pose({ lean: -14, hipY: 33, nearThigh: 62, nearShin: -50, nearUpper: 6, farUpper: 34, tail: 1 }),
  pose({ lean: -26, hipY: 32, nearThigh: 96, nearShin: 4, nearUpper: -10, farUpper: 46, tail: 4,
    flash: true, flashAt: 'foot', flashDx: 2, flashDy: 0 }),
  pose({ lean: -18, hipY: 33, nearThigh: 72, nearShin: -30, nearUpper: 2, farUpper: 38, tail: 2 }),
  pose({ lean: -2, nearThigh: 30, nearShin: -18, nearUpper: 18, tail: 0 }),
];

// Hurt — knocked back. Head snaps first, feet follow, which is why frame 1
// leans hard while the hips have barely moved.
export const hurt = [
  pose({ lean: -18, headTilt: -14, hipX: 25, nearUpper: -14, farUpper: -22, tail: -4 }),
  pose({ lean: -24, headTilt: -18, hipX: 23, hipY: 35, nearThigh: -8, farThigh: 8, nearUpper: -24, farUpper: -30, tail: -6 }),
  pose({ lean: -10, headTilt: -8, hipX: 25, nearUpper: 4, farUpper: -4, tail: -2 }),
];

// Block — a two-frame hold. Both arms cross high, hips drop.
export const block = [
  pose({ hipY: 36, lean: -6, headTilt: 4, nearUpper: 118, nearFore: 132, farUpper: 108, farFore: 140, nearThigh: 24, farThigh: -22, tail: -2 }),
  pose({ hipY: 37, lean: -8, headTilt: 5, nearUpper: 122, nearFore: 136, farUpper: 112, farFore: 144, nearThigh: 26, farThigh: -24, tail: -3 }),
];

export const ACTIONS = { idle, walk, punch, kick, hurt, block };

/** Milliseconds per frame. An attack's active frame is short; an idle breathes slowly. */
export const TIMING = {
  idle: [180, 180, 180, 180],
  walk: [90, 90, 90, 90, 90, 90],
  punch: [70, 50, 60, 60, 110],
  kick: [80, 60, 70, 70, 120],
  hurt: [70, 110, 90],
  block: [140, 140],
};
