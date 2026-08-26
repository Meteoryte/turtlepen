# Quickstart

Clone to first validated drawing, in about five minutes. No dependencies to
install — TurtlePen has none.

```bash
git clone https://github.com/Meteoryte/turtlepen
cd turtlepen
node --version          # 20 or newer
pnpm run check          # optional: the full suite should be green
```

## 1. Register the MCP server

Point your agent at `src/mcp/server.js`. It speaks JSON-RPC over stdio and needs
no arguments.

```json
{
  "mcpServers": {
    "turtlepen": {
      "command": "node",
      "args": ["/absolute/path/to/turtlepen/src/mcp/server.js"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add turtlepen -- node /absolute/path/to/turtlepen/src/mcp/server.js
```

To check it runs before wiring anything up:

```bash
pnpm run mcp        # should sit waiting on stdin; Ctrl-C to exit
```

## 2. The loop

Six calls, in this order. It is worth doing once by hand.

```
turtlepen_help                     read this first — it is the contract
measure   { text, maxWidthCells }  how big does this label actually need to be
new_diagram { name, path }
place_box { id, at, span, label }  place by address and cell span
validate                           the severity-ranked collision log
render    { path }                 writes the SVG and returns a renderHash
```

Then **look at the SVG**. That step is not optional and it is not decoration —
see below.

## 3. A first drawing

```
new_diagram { "name": "first", "path": "first.turtlepen.json", "cols": 60, "rows": 30 }
place_box   { "id": "start", "at": "D4",  "span": "20x6", "label": "Start", "shape": "terminator" }
place_box   { "id": "work",  "at": "D14", "span": "20x6", "label": "Do the thing" }
pen         { "id": "e1", "program": "pen from start.S\ndown line to work.N arrow" }
validate
render      { "path": "first.svg" }
```

`pen from <id>.<face>` is the one thing worth learning early. It seats the
cursor just outside a box's face, already pointing away from it — a box's south
face is already outside it but its north face is its own top row, and computing
that by hand is the most common off-by-one in the whole system.

## 4. What "done" means

A drawing is not finished until **all four** have happened:

1. **validated after the last edit** — an earlier clean log says nothing about
   the state you stopped in;
2. **adjudicated to zero open findings** — each one fixed, or accepted with a
   written reason via `accept_finding`;
3. **rendered to a file** — the SVG is part of the deliverable, not an extra
   produced when someone asks;
4. **looked at**.

Step 4 is the one people skip, and it is the one that catches the most. A
validation can be perfectly CLEAN over a drawing that depicts the wrong thing:
this repository's own corpus once validated clean while a sheep read as a
stegosaurus and half-tone spots dithered into plus-signs. Every coordinate was
legal. Record what you saw with `perceptual_review`.

## 5. When you get stuck

| Situation | Call |
|---|---|
| a finding names a fix and you want it applied | `repair { fingerprint }` — lists which fixes are one call away |
| you need a connector and do not want to work out the geometry | `route { from: "a.S", to: "b.N" }` — returns a pen program, changes nothing |
| you need a modelled direct, orthogonal, or node-attached curved edge | `connect { id, from: "a.E", to: "b.W", routing: "curved", via: ["K5.q1"] }` |
| the AI needs element purpose and ownership | `annotate { id, description, technology, tags, properties, perspectives }`, then `inspect_model` |
| artwork needs one-pixel cleanup without changing collision geometry | `micro_mask { action: "add", id, target, points: [{x,y}], width: 1 }`, or draw with the viewer eraser |
| you need one model rendered several ways | `define_view` for static, filtered, or ordered dynamic views; pass its key to the CLI renderer or viewer |
| you need to find a capability without loading the full manual | `search_help { query: "your task" }`; use `turtlepen_help { section: "all" }` only for the complete grammar |
| you have a Mermaid flowchart already | `import_mermaid { source }` — returns operations for `plan` |
| you want to see the actual quadrants, cheaply | `ascii` |
| "is there room here?" | `free_space { cellsW, cellsH }` |
| you edited three times and nothing improved | `validate` will tell you so |

## 6. Two things that are easy to miss

**The canvas is not a budget.** The grid is unbounded right and down. A declared
size is a starting point; `set_canvas` grows it. Fighting for room inside a size
you picked ten minutes ago is mistaking your own first guess for a constraint.

**A feature can be more than one stroke.** If detail would damage a shape by
being carved out of it, draw a second mark beside it. And `add_page` with
intent `overlay` puts marks on top without collision, so annotation does not
have to compete with artwork for the same quadrants.

## Where to go next

- [`README.md`](../README.md) — the lattice, the pen grammar, the rule table
- [`llm.md`](../llm.md) — the agent contract and the invariants, before changing `src/core/`
- [`status.md`](../status.md) — what is proven and what is deferred
- `turtlepen_help` — always current, and the authority over all of the above

## Native CLI

The same document format can be checked and published without an MCP host:

```bash
node src/cli.js doctor
node src/cli.js validate first.turtlepen.json
node src/cli.js inspect first.turtlepen.json
node src/cli.js render first.turtlepen.json --format png --out first.png --force
node src/cli.js render first.turtlepen.json --format pdf --out first.pdf --force
node src/cli.js bundle first.turtlepen.json --out first-docs
```

SVG/PNG/PDF and document writes are atomic. Browser and MCP mutations carry a
document hash so a stale editor cannot silently overwrite a newer in-memory
revision.
