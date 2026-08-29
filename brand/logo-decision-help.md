# TurtlePen MCP help — logo collision decisions

## collision review

```text
TurtlePen capability search: "collision review" — 2 match(es)
validate                 [review] Validate the whole composition and return the severity-ranked collision log. This is the plan -> validate step: draw everything first, then check it as a unit. Findings carry a fingerprint for accept_finding.
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.
```

## decision finding accept

```text
TurtlePen capability search: "decision finding accept" — 1 match(es)
accept_model_finding     [workspace] Record that one current fingerprinted semantic-model finding is deliberate. The decision lapses automatically when the finding changes.
```

## accept finding

```text
TurtlePen capability search: "accept finding" — 7 match(es)
remove                   [layout] Delete an element permanently. Prefer a repair tool where one applies: resize or restyle for a box that is the wrong size or label, replace_path to redraw a connector, move to reposition. Removing and re-adding loses the id, and with it any acceptances recorded against findings about that element.
reorder                  [other] Change an element’s presentation order within its page: bring_to_front, send_to_back, raise, lower, before, or after. Same-page collisions remain validation errors; use an overlay page and an accepted finding for deliberate stacking.
accept_finding           [review] Record a current finding as deliberate rather than an error — this is where intent is declared. Unknown or expired fingerprints are refused. The exact fingerprint and finding metadata remain auditable when geometry changes, and unaccept_finding withdraws the record.
unaccept_finding         [review] Withdraw a previously recorded acceptance, putting the finding back in the open log.
validate                 [review] Validate the whole composition and return the severity-ranked collision log. This is the plan -> validate step: draw everything first, then check it as a unit. Findings carry a fingerprint for accept_finding.
accept_model_finding     [workspace] Record that one current fingerprinted semantic-model finding is deliberate. The decision lapses automatically when the finding changes.
unaccept_model_finding   [workspace] Withdraw a semantic-model finding acceptance so the current finding becomes open again.
```

## resolve finding

```text
TurtlePen capability search: "resolve finding" — 0 match(es)
```

## L006 stroke overlap

```text
TurtlePen capability search: "L006 stroke overlap" — 0 match(es)
```

## junction hop

```text
TurtlePen capability search: "junction hop" — 0 match(es)
```

## intent overlay

```text
TurtlePen capability search: "intent overlay" — 1 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
```

## artwork overlap

```text
TurtlePen capability search: "artwork overlap" — 0 match(es)
```

## same page artwork

```text
TurtlePen capability search: "same page artwork" — 0 match(es)
```

## page overlay intent

```text
TurtlePen capability search: "page overlay intent" — 1 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
```

## accepted findings stale acceptances

```text
TurtlePen capability search: "accepted findings stale acceptances" — 0 match(es)
```
