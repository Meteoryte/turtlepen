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
split, four negative cases, a worksheet generator, an external adapter runner,
and a receipt scorer. The runner gives every configured system the same declared
model id and reports dimensions separately.

**Not here:** credentials or adapters for a model provider, human perceptual
judgements, or comparative results. Nothing has been run. TurtlePen will not
invent these external inputs or convert an unreviewed image into a pass.

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

Create a blank, partition-aware receipt worksheet:

```bash
node src/cli.js benchmark worksheet --partition dev --out benchmark/worksheet.json
```

Run adapters described by a JSON config. Each adapter reads one JSON task on
stdin and returns one JSON result on stdout:

```bash
node src/cli.js benchmark run benchmark/run-config.json --out benchmark/run.json
node src/cli.js benchmark score benchmark/run.json --out benchmark/scored.json
```

The runner does not grant provider access or choose a model. A run config must
name the shared model and executable adapters explicitly; raw metrics and
perceptual reviewers belong in their receipts.

Give the same task specification and the same rubric to every system. Score the
dimensions separately. Do not let a system win by omitting content — the rubric
says so explicitly and `T09` tests whether the scorer honours it.

And do not claim an advantage the evidence does not support. The claim worth
testing is narrow: *a model using TurtlePen is measurably better at constructing,
inspecting, repairing and revising visual artifacts than the same model using
less structured representations, at acceptable cost.* That is falsifiable, and
it has not been tested yet.
