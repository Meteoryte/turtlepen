/**
 * Layered graph layout.
 *
 * WHY THIS EXISTS. Every diagram in this repo used to compute its own
 * positions: a `GAP` constant, a `TOP` constant, a uniform width worked out
 * with `Math.max`, and a running row counter. That arithmetic is precisely what
 * makes a generated diagram LOOK generated — nodes evenly spaced in the order
 * they happened to be declared, edges crossing for no reason, a parent sitting
 * above the left-most of its children instead of above their middle. `align`
 * and `distribute` tidy an arrangement the author already chose. This CHOOSES
 * the arrangement.
 *
 * WHAT IT DOES NOT DO. It does not touch a document. It is a pure function from
 * a graph to coordinates, and the caller turns those coordinates into ordinary
 * `place_box` / `move` / `pen` operations that are rehearsed with `plan` and
 * validated like anything drawn by hand. `llm.md` requires that auto-routing,
 * when it arrives, "produce visible, inspectable output rather than quiet
 * correction" — so every edge this module lays out comes back as an explicit
 * list of lattice points, and the caller emits a pen program a human can read
 * and edit. Nothing here expresses geometry the normal path could not.
 *
 * THE METHOD is the standard layered one (Sugiyama; the refinements are
 * Gansner et al. and Sander), because it matches how a flowchart is actually
 * read — flow down the page, one rank per step:
 *
 *   1. RANK    longest-path, with cycles broken explicitly and REPORTED, never
 *              silently, since a reversed edge changes what the diagram claims.
 *   2. DUMMIES an edge spanning more than one rank becomes a chain of virtual
 *              nodes, one per rank it passes through. This is what lets a long
 *              edge own a lane instead of being drawn over whatever is in the
 *              way.
 *   3. ORDER   weighted-median sweeps plus adjacent transpose, scored on the
 *              REAL crossing count and keeping the best ordering seen — not the
 *              last one, which is the usual way this heuristic disappoints.
 *   4. X       the priority method: each node pulls toward the median of its
 *              neighbours, and dummy nodes outrank real ones so a long edge
 *              comes out straight rather than kinked around a box.
 *
 * Everything is integer cells throughout. There is no float to round, which is
 * the same reason the rest of the engine holds its geometry exactly.
 */

/** Order-improvement sweeps. Past this the median heuristic stops finding anything. */
const ORDER_PASSES = 8;
/** Priority sweeps used to straighten coordinates. */
const COORD_PASSES = 8;
/** A virtual node is one cell wide: an edge lane, not a box. */
const DUMMY_WIDTH = 1;

/**
 * Break cycles so ranking terminates and the result is a DAG.
 *
 * Reversed edges are RETURNED, not swallowed. A flowchart with a loop in it is
 * a normal thing to draw, but the layout had to make a decision about it, and
 * the caller should be able to say so on the drawing.
 */
export function breakCycles(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, []]));
  for (const [i, e] of edges.entries()) {
    if (e.from === e.to) continue;
    out.get(e.from)?.push({ i, to: e.to });
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const mark = new Map(ids.map((id) => [id, WHITE]));
  const reversed = new Set();

  // Iterative DFS: a graph deep enough to matter is also deep enough to blow a
  // recursive stack, and this runs on whatever an author hands it.
  for (const root of ids) {
    if (mark.get(root) !== WHITE) continue;
    mark.set(root, GREY);
    const stack = [{ id: root, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const kids = out.get(frame.id);
      if (frame.next >= kids.length) { mark.set(frame.id, BLACK); stack.pop(); continue; }
      const { i, to } = kids[frame.next++];
      const state = mark.get(to);
      if (state === GREY) reversed.add(i); // a back edge — this is what closes a cycle
      else if (state === WHITE) { mark.set(to, GREY); stack.push({ id: to, next: 0 }); }
    }
  }

  const acyclic = [];
  const selfLoops = [];
  for (const [i, e] of edges.entries()) {
    if (e.from === e.to) { selfLoops.push(i); continue; }
    acyclic.push(reversed.has(i)
      ? { from: e.to, to: e.from, edge: i, reversed: true }
      : { from: e.from, to: e.to, edge: i, reversed: false });
  }
  return { edges: acyclic, reversed: [...reversed], selfLoops };
}

/** Longest-path ranking over a DAG: a node sits one below its deepest predecessor. */
export function rankNodes(nodes, acyclicEdges) {
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of acyclicEdges) {
    if (!rank.has(e.from) || !rank.has(e.to)) continue;
    out.get(e.from).push(e.to);
    incoming.set(e.to, incoming.get(e.to) + 1);
  }

  // Kahn order, so each node is finalised only after every predecessor is.
  const queue = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const seen = [];
  while (queue.length) {
    const id = queue.shift();
    seen.push(id);
    for (const to of out.get(id)) {
      rank.set(to, Math.max(rank.get(to), rank.get(id) + 1));
      incoming.set(to, incoming.get(to) - 1);
      if (incoming.get(to) === 0) queue.push(to);
    }
  }
  if (seen.length !== nodes.length) {
    throw new Error('layout: ranking did not settle — the edge list still holds a cycle after breaking');
  }
  return rank;
}

/**
 * Split every edge spanning more than one rank into a chain of virtual nodes.
 *
 * The chain is what makes routing honest: the edge occupies a column on each
 * rank it crosses, so ordering and coordinate assignment can see it and give it
 * room, instead of the renderer drawing a line straight over a box.
 */
export function insertDummies(nodes, edges, rank) {
  const all = nodes.map((n) => ({ ...n, dummy: false }));
  const chains = new Map();
  const segments = [];
  let serial = 0;

  for (const e of edges) {
    const a = rank.get(e.from);
    const b = rank.get(e.to);
    if (b - a <= 1) { segments.push({ from: e.from, to: e.to, edge: e.edge }); chains.set(e.edge, []); continue; }
    const chain = [];
    let prev = e.from;
    for (let r = a + 1; r < b; r++) {
      const id = `\u0000d${serial++}`; // NUL-prefixed: cannot collide with an author's id
      all.push({ id, cellsW: DUMMY_WIDTH, cellsH: 1, dummy: true, edge: e.edge });
      rank.set(id, r);
      chain.push(id);
      segments.push({ from: prev, to: id, edge: e.edge });
      prev = id;
    }
    segments.push({ from: prev, to: e.to, edge: e.edge });
    chains.set(e.edge, chain);
  }
  return { nodes: all, segments, chains };
}

/** Crossings between two adjacent ranks, counted exactly rather than estimated. */
export function countCrossings(upper, lower, segments) {
  const up = new Map(upper.map((id, i) => [id, i]));
  const low = new Map(lower.map((id, i) => [id, i]));
  const pairs = [];
  for (const s of segments) {
    if (up.has(s.from) && low.has(s.to)) pairs.push([up.get(s.from), low.get(s.to)]);
  }
  let n = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [ai, aj] = pairs[i];
      const [bi, bj] = pairs[j];
      if ((ai < bi && aj > bj) || (bi < ai && bj > aj)) n++;
    }
  }
  return n;
}

const totalCrossings = (order, segments) => order
  .slice(0, -1)
  .reduce((sum, ids, r) => sum + countCrossings(ids, order[r + 1], segments), 0);

/**
 * Weighted median of a node's neighbours on the adjacent rank.
 *
 * -1 means "no neighbours that way": such a node keeps its current place rather
 * than being flung to the left edge, which is the classic bug in a naive median.
 */
function medianValue(id, adjacent, segments, direction) {
  const ps = [];
  for (const s of segments) {
    const mine = direction === 'down' ? s.to === id : s.from === id;
    if (!mine) continue;
    const p = adjacent.get(direction === 'down' ? s.from : s.to);
    if (p !== undefined) ps.push(p);
  }
  if (!ps.length) return -1;
  ps.sort((a, b) => a - b);
  const m = ps.length >> 1;
  if (ps.length % 2) return ps[m];
  if (ps.length === 2) return (ps[0] + ps[1]) / 2;
  // Gansner's interpolation: bias toward whichever side has the tighter links.
  const left = ps[m - 1] - ps[0];
  const right = ps[ps.length - 1] - ps[m];
  return (ps[m - 1] * right + ps[m] * left) / (left + right || 1);
}

/** Order nodes within each rank to reduce crossings. Returns the BEST ordering seen. */
export function orderRanks(byRank, segments) {
  let order = byRank.map((ids) => [...ids]);
  let best = order.map((ids) => [...ids]);
  let bestScore = totalCrossings(order, segments);

  for (let pass = 0; pass < ORDER_PASSES && bestScore > 0; pass++) {
    const down = pass % 2 === 0;
    const ranks = down
      ? [...order.keys()].slice(1)
      : [...order.keys()].slice(0, -1).reverse();

    for (const r of ranks) {
      const neighbours = down ? order[r - 1] : order[r + 1];
      const adjacent = new Map(neighbours.map((id, i) => [id, i]));
      const medians = new Map(order[r].map((id) => [id, medianValue(id, adjacent, segments, down ? 'down' : 'up')]));
      order[r] = order[r]
        .map((id, i) => ({ id, i }))
        .sort((a, b) => {
          const ma = medians.get(a.id);
          const mb = medians.get(b.id);
          if (ma === -1 || mb === -1) return a.i - b.i; // an unanchored node holds station
          return ma - mb || a.i - b.i;
        })
        .map((x) => x.id);
    }

    transpose(order, segments);
    const score = totalCrossings(order, segments);
    if (score < bestScore) { bestScore = score; best = order.map((ids) => [...ids]); }
    else order = best.map((ids) => [...ids]); // never carry a worse ordering forward
  }
  return { order: best, crossings: bestScore };
}

/** Swap adjacent pairs while that removes a crossing. Cheap, and it finds what the median misses. */
function transpose(order, segments) {
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 32) {
    improved = false;
    for (let r = 0; r < order.length; r++) {
      for (let i = 0; i + 1 < order[r].length; i++) {
        const before = neighbourCrossings(order, segments, r);
        const swapped = [...order[r]];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        const trial = order.map((ids, k) => (k === r ? swapped : ids));
        if (neighbourCrossings(trial, segments, r) < before) { order[r] = swapped; improved = true; }
      }
    }
  }
}

const neighbourCrossings = (order, segments, r) =>
  (r > 0 ? countCrossings(order[r - 1], order[r], segments) : 0)
  + (r + 1 < order.length ? countCrossings(order[r], order[r + 1], segments) : 0);

/**
 * Assign integer x positions by the priority method.
 *
 * Each node wants to sit at the median of its neighbours on the adjacent rank.
 * It gets to, if nothing with a stronger claim is already in the way. Dummy
 * nodes hold the strongest claim of all — a long edge that bends around a box
 * reads as a mistake even when it is not, so straightening the lane matters
 * more than centring any single box.
 */
export function assignX(order, segments, sizeOf, gap) {
  const width = (id) => sizeOf(id).cellsW ?? 1;
  const x = new Map(); // left edge, in cells
  const centre = (id) => x.get(id) + Math.floor(width(id) / 2);

  for (const ids of order) {
    let cursor = 0;
    for (const id of ids) { x.set(id, cursor); cursor += width(id) + gap; }
  }

  const priority = new Map();
  const degree = new Map();
  for (const s of segments) {
    degree.set(s.from, (degree.get(s.from) ?? 0) + 1);
    degree.set(s.to, (degree.get(s.to) ?? 0) + 1);
  }
  for (const ids of order) {
    for (const id of ids) {
      priority.set(id, sizeOf(id).dummy ? Number.MAX_SAFE_INTEGER : (degree.get(id) ?? 0));
    }
  }

  for (let pass = 0; pass < COORD_PASSES; pass++) {
    const down = pass % 2 === 0;
    const ranks = down ? [...order.keys()].slice(1) : [...order.keys()].slice(0, -1).reverse();
    for (const r of ranks) {
      const neighbours = down ? order[r - 1] : order[r + 1];
      const adjacent = new Map(neighbours.map((id) => [id, centre(id)]));
      const wanted = new Map(order[r].map((id) => [id, medianValue(id, adjacent, segments, down ? 'down' : 'up')]));
      const settled = new Set();
      for (const id of [...order[r]].sort((a, b) => priority.get(b) - priority.get(a))) {
        const want = wanted.get(id);
        if (want !== -1) {
          shiftToward(order[r], id, Math.round(want) - centre(id), x, width, gap, priority, settled);
        }
        settled.add(id);
      }
    }
  }

  const min = Math.min(...x.values());
  for (const [id, v] of x) x.set(id, v - min);
  return x;
}

/**
 * Move one node by `delta`, pushing weaker neighbours along and stopping dead
 * at a stronger one. This is what keeps a sweep from undoing itself: a node
 * already placed for a better reason does not get shoved aside.
 */
function shiftToward(rankIds, id, delta, x, width, gap, priority, settled) {
  if (!delta) return;
  const step = Math.sign(delta);
  const idx = rankIds.indexOf(id);
  for (let moved = 0; moved < Math.abs(delta); moved++) {
    const chain = [id];
    let k = idx;
    // Collect everything that would have to move along with it, in that direction.
    for (;;) {
      const nextIdx = k + step;
      if (nextIdx < 0 || nextIdx >= rankIds.length) break;
      const me = rankIds[k];
      const other = rankIds[nextIdx];
      const clearance = step > 0
        ? x.get(other) - (x.get(me) + width(me))
        : x.get(me) - (x.get(other) + width(other));
      if (clearance > gap) break; // room to move without disturbing anyone
      if (settled.has(other) && priority.get(other) >= priority.get(id)) return; // a stronger claim blocks
      chain.push(other);
      k = nextIdx;
    }
    for (const member of chain) x.set(member, x.get(member) + step);
  }
}

/**
 * Lay out a graph.
 *
 * `nodes` are `{ id, cellsW, cellsH }`; `edges` are `{ from, to }`. Everything
 * returned is integer cells, and `lanes` gives each edge the exact points its
 * connector should pass through, so the caller emits a pen program rather than
 * a promise.
 */
export function layoutGraph({
  nodes, edges = [], gapX = 4, gapY = 5, originCol = 3, originRow = 3,
} = {}) {
  if (!Array.isArray(nodes) || !nodes.length) throw new Error('layout: needs at least one node');
  const known = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    for (const end of [e.from, e.to]) {
      if (!known.has(end)) throw new Error(`layout: an edge names "${end}", which is not one of the nodes`);
    }
  }

  const { edges: acyclic, reversed, selfLoops } = breakCycles(nodes, edges);
  const rank = rankNodes(nodes, acyclic);
  const { nodes: withDummies, segments, chains } = insertDummies(nodes, acyclic, rank);

  const sizeOf = new Map(withDummies.map((n) => [n.id, n]));
  const depth = Math.max(...rank.values()) + 1;
  const byRank = Array.from({ length: depth }, () => []);
  for (const n of withDummies) byRank[rank.get(n.id)].push(n.id);

  const crossingsBefore = totalCrossings(byRank, segments);
  const { order, crossings } = orderRanks(byRank, segments);
  const x = assignX(order, segments, (id) => sizeOf.get(id), gapX);

  // A rank is as tall as its tallest real node, so a rank of tall boxes does
  // not squash a rank of short ones, or the other way round.
  const rowOf = [];
  const heightOf = [];
  let row = originRow;
  for (let r = 0; r < depth; r++) {
    rowOf.push(row);
    const tall = Math.max(1, ...order[r].map((id) => sizeOf.get(id).cellsH ?? 1));
    heightOf.push(tall);
    row += tall + gapY;
  }

  const positions = new Map();
  for (const n of nodes) {
    positions.set(n.id, { col: originCol + x.get(n.id), row: rowOf[rank.get(n.id)], rank: rank.get(n.id) });
  }

  const lanes = new Map();
  for (const e of acyclic) {
    lanes.set(e.edge, (chains.get(e.edge) ?? []).map((id) => ({
      col: originCol + x.get(id),
      row: rowOf[rank.get(id)],
      rank: rank.get(id),
    })));
  }

  return {
    positions,
    lanes,
    ranks: rank,
    order: order.map((ids) => ids.filter((id) => !sizeOf.get(id).dummy)),
    depth,
    // Where each rank sits and how tall it is. The caller needs both to space
    // connectors inside the channel between two ranks rather than stacking
    // every one of them on the same line.
    rankRows: rowOf,
    rankHeights: heightOf,
    gapY,
    crossings,
    crossingsBefore,
    reversed,
    selfLoops,
  };
}
