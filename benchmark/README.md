# Benchmark corpus

`corpus-v1.json` — 16 frozen tasks for comparing visual authoring through
TurtlePen against raw SVG and diagram DSLs.

## Frozen means frozen

`test/benchmark-corpus.test.js` asserts a digest of the task list. **Editing an
existing task changes the hash and fails the build.**

That mechanism is the entire point. A benchmark you can adjust after seeing your
score measures nothing except your willingness to adjust it, and the temptation
is strongest exactly when the result is disappointing. Adding a task is fine —
give it a new id and update `FROZEN_DIGEST` in the same commit, so the change is
visible in review rather than invisible in a number.

## What is here, and what is not

**Here:** the task specifications, the four scoring dimensions, a dev/holdout
split, and four negative cases.

**Not here:** the execution harness, the model runners, and any results. Nothing
has been run. The corpus is the part that must be fixed *before* measuring, and
publishing a rubric alongside results produced by the same hand is how
benchmarks become advocacy.

## The four dimensions, kept apart

`structural`, `semantic`, `perceptual`, `workflow` — reported separately and
never collapsed into one number. The whole reason this project exists is that a
structurally perfect drawing can depict the wrong thing, and a single score
would hide precisely that. `T10` exists to catch a scorer that does it anyway.

## The negative cases

Four of the sixteen tasks are traps, and two of them are calibration cases drawn
from real failures in this repository:

- `T09` clean-but-empty — validates perfectly, says almost nothing.
- `T10` valid nonsense — correct shapes wired in an order that cannot happen.
- `T11` confusable silhouette — the sheep that read as a stegosaurus.
- `T12` accidental glyph — half-tone spots that dithered into plus-signs.

A benchmark with no traps rewards whatever the system already does well. These
are the cases where a naive scorer and an honest one disagree.

## Using it

Give the same task specification and the same rubric to every system. Score the
dimensions separately. Do not let a system win by omitting content — the rubric
says so explicitly and `T09` tests whether the scorer honours it.

And do not claim an advantage the evidence does not support. The claim worth
testing is narrow: *a model using TurtlePen is measurably better at constructing,
inspecting, repairing and revising visual artifacts than the same model using
less structured representations, at acceptable cost.* That is falsifiable, and
it has not been tested yet.
