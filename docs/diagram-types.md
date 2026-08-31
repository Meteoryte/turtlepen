# Diagram types

A catalogue of diagram types, what each one is for, and — the part that matters
here — **which of each type's conventions this engine actually checks.**

## Where this came from

The type vocabulary is adapted from the Diagram Design skill
([github.com/cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design),
MIT, © 2025 Cathryn Lavery), which describes ~40 diagram types as authoring
guidance for a model to follow.

Two projects arrived at the same two rules independently, without seeing each
other's work: **every coordinate lands on a grid**, and **text is measured per
character before a box is sized**. That skill states them as discipline —
`grid: 4`, "measure per character, not per script". TurtlePen makes them
structural: 5px quadrants that `rect()` refuses to round, and a measurement the
renderer is obliged to honour through `textLength`.

That convergence is the reason this catalogue is worth having. The same move
applies to type conventions: where the skill says "don't do X", TurtlePen can
often *report* X.

## What is checked, and what is not

The engine's standing rule, from `flowchart.js`:

> A rule that guesses is worse than no rule: it trains the author to ignore the
> log, which is the exact failure this engine exists to design out.

So a convention becomes a rule **only when it is decidable from authored fact** —
something the author wrote down, not something inferred from how the drawing
looks. Everything else stays in this document as guidance, and is marked so.

| Rule | Type | Checks |
|---|---|---|
| `F001` | Flowchart | exactly one start |
| `F002` | Flowchart | a decision has at least two ways out |
| `W001` | Swimlane | every lane is labelled |
| `W002` | Swimlane | no step lies across two lanes |
| `C002` | any | the focal budget is not overspent |
| `L024` | any | a symbol is not stretched past recognition |

Six rules across ~40 types is the honest number, not a shortfall. Most type
conventions are about meaning the drawing does not contain.

## Why most conventions cannot be rules

Three recurring reasons, with the examples that produce them:

**The data is not in the drawing.** A timeline should not space events evenly
when they are not evenly spaced in time — but a TurtlePen document holds
positions, not dates. Nothing in it knows what the spacing *should* be.

**The judgement is aesthetic.** A swimlane's arrows "should not snake back and
forth"; a tree's nodes should use "two widths at most". Both are real advice and
neither has a threshold that separates a deliberate composition from a careless
one.

**The claim is about the world, not the picture.** "Emphasise the handoff that
introduces the most coupling" requires knowing the system being drawn. The
engine can check that at most two things are emphasised (`C002`); it cannot know
whether they are the right two.

## The types

Grouped by what the reader is meant to take away. Each entry says what it is for
and what the engine can say about it.

### Process and flow

| Type | Best for | Engine |
|---|---|---|
| Flowchart | decisions and branches | `F001`, `F002` |
| Swimlane | who owns each step | `W001`, `W002` |
| Process | ordered stages, repeated slots | shapes only |
| Sequence | message order between actors | shapes only |
| State | states and the transitions between them | shapes only |
| Journey | a person's path through a service | shapes only |
| Loop | a cycle with no natural start | shapes only |
| Data flow | fan-in, bottlenecks, backpressure | shapes only |
| Kanban | work in columns by status | container shapes |
| Story map | activities over releases | container shapes |
| Gantt | scheduled work over time | not modelled |
| Timeline | events in order | not modelled |

### Structure and architecture

| Type | Best for | Engine |
|---|---|---|
| Architecture | services and what talks to what | roles, `C002` |
| High level | the whole system on one page | roles, `C002` |
| Deployment | where things run | roles |
| Layers | strict hierarchy of tiers | container shapes |
| Nested | containment | container shapes |
| Tree | parent to child | shapes only |
| Org chart | who reports to whom | shapes only |
| Dependency | what needs what | shapes only |
| Medallion | bronze/silver/gold data tiers | container shapes |
| IT state | current versus target | roles |
| DB schema | tables and keys | `data` shape |
| ER | entities and relationships | shapes only |
| UML class | classes and members | `subprocess` shape |

### Comparison and quantity

| Type | Best for | Engine |
|---|---|---|
| Quadrant | two axes, four positions | not modelled |
| Wardley | evolution against value | not modelled |
| Radar | several series across axes | not modelled |
| Bar · Line · Scatter | quantities and trends | not modelled |
| Sankey | flow with magnitude | not modelled |
| Treemap | part of a whole, by area | not modelled |
| Venn | overlap between sets | not modelled |
| Pyramid | ranked tiers | container shapes |
| Fishbone | causes of an effect | shapes only |
| Polar | cyclical quantity | not modelled |

**"Not modelled"** means TurtlePen has no primitive for the type's load-bearing
idea — an axis, a scale, a magnitude. It does not mean the type cannot be drawn:
every one of them is reachable with `pen`, and the tileset and postcard examples
show the lattice will draw anything. It means the engine cannot check whether
what you drew is a correct instance of that type, and will not pretend to.

## Adding a type

Follow `flowchart.js` and `swimlane.js`. Both are ~70 lines and share a shape:

1. **Self-activate.** Detect the type from primitives already in the document —
   `isFlowchart` looks for decision or terminator shapes, `isSwimlane` for two or
   more lanes. No flag, and no reclassification of existing drawings.
2. **Check only authored fact.** If deciding the rule needs you to infer intent
   from proximity, size, or colour, it is not a rule.
3. **Name every actor.** `W002` names the step *and* both lanes it straddles, so
   the fix is obvious without opening the file.
4. **Pick the severity honestly.** A structural contradiction is `S1`. A
   convention the author may knowingly break is `S2` or `S3`.
5. **Register the rules** in `collide.js` and add them to the table above.
