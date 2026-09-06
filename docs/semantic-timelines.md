# Semantic timelines

TurtlePen 0.4 adds a first-class semantic timeline model without adding a
second renderer. A timeline compiles into the same editable boxes, paths, text,
pages, annotations, groups, and quantitative scales as every other drawing.
The semantic source remains in document schema 4 so an agent can inspect,
update, reflow, validate, save, reopen, undo, and redo it without reverse
engineering coordinates.

## Smallest useful example

```json
{
  "op": "timeline",
  "id": "release-history",
  "title": "Release history",
  "orientation": "vertical",
  "events": [
    { "id": "prototype", "date": "2026-08-29", "title": "Prototype", "type": "milestone" },
    { "id": "v1", "date": "2026-09-03", "title": "First release", "type": "release" },
    { "id": "next", "displayDate": "Planned", "title": "Next release", "status": "planned", "sequence": 1 }
  ]
}
```

Send that operation to `plan` first, inspect its exact diff and findings, then
commit it or call the `timeline` tool with the same fields. The high-level tool
supports `create`, `update`, `add_event`, `update_event`, `remove_event`,
`reflow`, and `inspect`. Stable primitive IDs use
`<timeline>__<event>__<role>`; unchanged events keep those identities across
reflow.

## Semantic model

An event can carry a type (`point`, `period`, `phase`, `milestone`, `release`,
`deadline`, or `transition`), title, description, canonical date or range,
display date, uncertainty, current state, status, phase, track, category,
parent, sequence, supporting resource strings, and typed relationships to other
events. Phases and tracks are declared separately.

Canonical dates accept only real ISO `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` values.
Their precision and numeric value are persisted separately from `displayDate`.
Text such as “Late August”, “Before launch”, “Current”, or “Unknown” therefore
stays honest: TurtlePen never turns it into an invented machine date. A range
whose end precedes its start is refused.

Chronological order is the default. Equal dates preserve input order and
undated events follow their explicit sequence. Set `order: "input"` when the
authored sequence intentionally interleaves undated transitions with dated
events.

## Layout and scale policies

`orientation` is `vertical` or `horizontal`. The shared layout compiler applies
one of these policies:

- `alternating`: readable cards alternate across the axis.
- `single-sided`: every card stays on the requested `start` or `end` side.
- `multi-track`: each event chooses a declared track when more than one exists.
- `phase-band`: ordinary group-shaped boxes show declared phase membership.
- `compact`: smaller type and cards favor a dense history.
- `detailed`: descriptions, status, category, and resources appear in cards.

Every card is measured with the canonical text engine before placement. The
compiler expands the canvas when allowed and refuses an explicit span below the
measured minimum instead of truncating, overlapping, or shrinking text.

`spacing: "ordinal"` is the readable default. `spacing: "temporal"` projects
real date values through a persisted TurtlePen position scale. Dense same-date
clusters retain input order and undated events receive no fake scale value. If
the smallest interval would require an unreasonable automatic canvas, the
compiler reports the minimum and asks for an intentional choice.

## Markers, roles, and monochrome meaning

Ordinary events use circles, milestones and transitions use diamonds, releases
and periods use squares, and deadlines use triangles. A current event uses an
emphasized filled disc; planned events are hollow/dashed; approximate events
use dotted markers and links. These distinctions survive monochrome output.

Cards use semantic theme roles (`timeline-event`, `timeline-milestone`,
`timeline-release`, `timeline-deadline`, `timeline-current`,
`timeline-planned`, and `timeline-phase`) rather than storing a fixed palette.
Color supports the hierarchy but does not carry it alone.

## Editing, reflow, and validation

Generated primitives remain available to `move`, `resize`, `restyle`,
`reorder`, `duplicate`, `remove`, `group`, `constraint`, and `path_edit`.
`reflow` captures safe presentation changes such as a card fill and reapplies
them after deterministic compilation. Manual geometry is replaced by the new
layout and is named in `invalidatedOverrides`; semantic content remains owned
by the timeline source.

Timeline checks use the normal severity, fingerprint, acceptance, and release
systems. They detect missing primitives, broken timeline/event associations,
misordered dated markers, missing phase/track/parent/relationship references,
conflicting current events, lost approximate styling, false temporal
proportions, and empty phases. Ordinary collision and text rules still apply to
the compiled elements.

`describe` returns timeline summaries beside their generated elements.
`inspect_model` reads the annotations on cards, markers, links, phase bands,
axes, tracks, and titles. Each annotation carries compilation origin, timeline
and event identity, type, canonical and display dates, precision, status,
approximation, phase, track, category, parent, resources, and relationships as
applicable.

## Mermaid timeline import

`import_mermaid` accepts Mermaid `timeline` syntax as well as flowcharts. It
preserves the title, `section` headings as phases, ISO dates/ranges, current
labels, and every event/detail line, then returns one normal `timeline`
operation without changing the document. Human period labels remain
`displayDate`; unsupported directives are refused by name. Feed the returned
operation to `plan` and commit only after reviewing the normal validation log.

`export_timeline` returns complete semantic source with `format:"json"`.
`format:"mermaid"` returns a content projection for representable point/period
events and section headings, with identity mapping and explicit layout omissions.
Tracks, typed relationships, parents, resources, current/approximate state, and
other unrepresentable event fields produce `exported:false` and a precise
`unsupported` list. Mermaid output never claims to be a lossless native document.

## Reference fixtures

The connection-history fixture is generated in
[vertical](../diagrams/turtlepen-connection-history-vertical.svg) and
[horizontal](../diagrams/turtlepen-connection-history-horizontal.svg) forms by
`pnpm run timeline-history`. Both preserve the accepted history facts and use
the same semantic input. The pair is evidence that orientation changes layout,
not meaning; its perceptual review is hash-bound to the exact rendered bytes.

## Current limits

- `showRelationships:true` draws stable native orthogonal relationship paths and
  labels. Existing layouts default to annotations; unavailable routes refuse.
- Phase membership is validated, but a phase without exact bounds does not
  imply dates. This avoids false precision.
- `currentDate` has a visible temporal-axis marker when it falls in the declared
  domain; ordinal/outside-domain dates are explicit contextual labels.
- Full native layout and primitive overrides require the native document.
