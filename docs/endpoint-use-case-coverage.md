# Endpoint and use-case coverage

**As of 2026-08-26.** This is the executable surface contract for TurtlePen.
An endpoint is covered only when a test crosses its real transport or exercises
the exact shared core path. Name-count checks alone are not considered coverage.

## MCP JSON-RPC transport

| Method | Successful case | Failure or boundary case | Evidence |
|---|---|---|---|
| `initialize` | supported version and server metadata | unsupported version falls back to the current supported version | `test/mcp.test.js` |
| `notifications/initialized` | accepted without a reply | notification response suppression | `test/mcp.test.js` |
| `notifications/cancelled` | accepted without a reply | notification response suppression | `test/mcp.test.js` |
| `ping` | returns an empty result | connection remains ordered | `test/mcp.test.js` |
| `tools/list` | schemas for the complete live tool set | exact comparison to `createTools` prevents drift | `test/mcp.test.js` |
| `tools/call` | all 52 tools complete over real stdio | unknown tool, schema refusal, and readable tool error | `test/endpoints.test.js`, `test/mcp.test.js` |
| unknown request | n/a | JSON-RPC `-32601` | `test/mcp.test.js` |
| malformed JSON | n/a | JSON-RPC `-32700` with null id | `test/mcp.test.js` |

## MCP tools

`test/endpoints.test.js` invokes every row through the child-process stdio
server and compares its covered names with the live tool registry. Adding a
tool without a successful transport case fails the suite.

| Tool | Representative proven use case |
|---|---|
| `turtlepen_help` | retrieve the complete authoring reference before a document exists |
| `runtime_info` | identify the running version, schema, capabilities, session, and document hash |
| `new_diagram` | create and checkpoint a named diagram with explicit canvas bounds |
| `open_diagram` | reopen persisted wireframe source and history state |
| `add_page` | add an overlay page |
| `remove_page` | remove temporary tracing scaffolding |
| `measure` | size wrapped text before placement |
| `place_box` | place labelled equipment with exact cell dimensions |
| `pen` | author an exact artwork path |
| `connect` | author direct, orthogonal, and node-attached curved semantic relationships |
| `annotate` | persist descriptions, technology, tags, properties, and perspectives |
| `validate` | obtain structured current findings and fingerprints |
| `inspect_model` | enumerate missing semantics, disconnected nodes, and broken relationship references |
| `accept_finding` | record an auditable reason for a current finding |
| `ascii` | inspect the claimed lattice without a browser |
| `free_space` | find a fitting rectangle across the page stack in a bounded region |
| `describe` | inspect exact regional geometry |
| `group` | create, list, move, add, remove, and delete a subsystem group |
| `constraint` | create, list, synchronize, cascade, and delete a follow relationship |
| `remove` | permanently remove an element |
| `resize` | repair a box while keeping an anchor pinned |
| `restyle` | repair label, corner, alignment, and fill presentation |
| `move` | move a target and cascade its dependent |
| `rename` | change an element id without redraw |
| `update_page` | change title and visibility of a page |
| `set_canvas` | expand declared composition bounds |
| `extend_path` | continue from a stored pen endpoint |
| `replace_path` | reroute a path while keeping its identity |
| `micro_mask` | apply a reversible 1-design-pixel eraser without changing structural geometry |
| `unaccept_finding` | withdraw a prior finding acceptance |
| `plan` | rehearse without mutation, then commit the same batch atomically |
| `render` | export a forced full-canvas SVG without a grid |
| `measure_image` | read intrinsic dimensions and exact contain/cover render plus embed, dither, simplify, and resolved supersampled-working-canvas scales before placement |
| `wireframe` | build a dimensioned HVAC area, equipment, and measured line-set run |
| `perspective_scene` | project a room, equipment, and a measured 3D run through a camera |
| `export_prompt` | emit a current wireframe composition brief for an image model |
| `place_image` | embed evidence, dither tonal source art, or intentionally simplify prepared imagery on a bounded 1x/2x/4x working canvas before coverage-preserving final reduction; report all scaling/processing/readability and refuse stale-grid raster resize |
| `place_reference` | dither or simplify source art onto a temporary underlay and block busy output, unreviewed continuous-tone approximations, or publication before removal |
| `history` | inspect, undo, redo, and clear durable edit recovery |
| `save` | checkpoint to a new path with explicit forced-save provenance |

## Viewer HTTP endpoints

`test/viewer.test.js` derives the static route list from
`src/viewer/capabilities.js`. Every public route is checked with `GET`, `HEAD`,
security headers, and a refused `POST`.

| Route | Contract |
|---|---|
| `/` | live editor HTML |
| `/app.js` | external browser controller |
| `/style.css` | editor stylesheet |
| `/brand-logo.svg` | public brand mark only |
| `/favicon.ico` | quiet `204` response |
| `/api/state` | complete compatibility state and cheap `since` response |
| `/ws` | local-origin WebSocket upgrade and initial state broadcast |
| any other path | `404`; server source, capabilities, and traversal attempts stay private |
| any non-GET/HEAD method | `405` with `Allow: GET, HEAD` |

## Viewer WebSocket contract

Every tool in `VIEWER_TOOLS` completes over a masked WebSocket frame, mutating
calls broadcast a higher revision, and the final state is verified on disk.
The covered editor operations are `move`, `resize`, `restyle`, `remove`,
`group`, `constraint`, `history`, `extend_path`, `replace_path`,
`micro_mask`, `accept_finding`, and `unaccept_finding`.

The frame matrix proves:

- same-origin upgrade, foreign-origin refusal, and private non-`/ws` routes;
- masked text frames, multiple frames in one packet, ping/pong, and clean close;
- refusal of unmasked, fragmented, binary, invalid UTF-8, reserved-bit,
  reserved-opcode, malformed-close, oversized-control, and over-64-KiB frames;
- serialized mutations, two-client broadcasts, outside-file reload, missing-file
  state, blocked tools, invalid JSON, and exact accepted/stale/withdrawn states.

## Known workflow families

| Workflow | End-to-end evidence |
|---|---|
| measure, place, validate, repair, render | `examples/build-example.js`, `test/endpoints.test.js` |
| whole-composition rehearsal and atomic commit | `examples/agent-session.js`, `test/composition.test.js` |
| dense ports, free-space failure, rework | `examples/constraint-stress.js` |
| commit, detect, undo, redo, reopen | `examples/rework-session.js`, `test/mcp.test.js` |
| Z-page overlay and text occlusion | `test/collide.test.js`, `test/mcp.test.js` |
| path authoring, anchors, ports, arrows, hops | `test/pen.test.js`, `test/connectors.test.js` |
| groups and durable follow constraints | `test/edit.test.js`, `test/mcp.test.js`, `test/viewer.test.js` |
| finding adjudication and publication gate | `test/gate.test.js`, `test/viewer.test.js` |
| image measurement, up/downscale, contain/cover, embedding, tonal dither, 1x/2x/4x supersampled non-fidelity simplification, five seeded-random RGB/RGBA and fit/detail trials, exact weighted-coverage resolve, minimum semantic size, working-memory limit, continuous-tone review gate, tracing, hostile-input refusal, resize/re-place, save/reopen | `examples/image-session.js`, `examples/supersample-random-five.js`, `test/image-mcp.test.js`, `test/image.test.js`, `test/png.test.js`, `test/dither.test.js`, `test/endpoints.test.js`, `test/viewer.test.js` |
| dimensioned plan/elevation and prompt export | `test/composition.test.js`, `test/mcp.test.js` |
| 3D perspective provenance | `test/render.test.js`, `test/endpoints.test.js` |
| exact SVG, ASCII, PNG, and raster output | `test/render.test.js`, `test/png.test.js`, `test/raster.test.js` |
| local editor desktop/mobile interaction | headed browser sweep plus `test/viewer.test.js` |
| canonical reproducible examples | `pnpm run check` |

The intentional non-features remain auto-fit, auto-routing, proportional fonts,
and negative addressing. They are design boundaries, not untested endpoints.
