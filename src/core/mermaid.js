/**
 * Mermaid `flowchart` import.
 *
 * Mermaid is how flowcharts are already written in the wild, and its node
 * syntax maps almost exactly onto the symbol vocabulary this engine gained:
 * `{diamond}` is a decision, `([stadium])` is a terminator, `[/slanted/]` is
 * io. So an import is a COMPILER onto existing operations, not a second way to
 * build a document.
 *
 * That distinction is the whole design. This module emits a plan — an ordered
 * list of `place_box` and `pen` operations — and hands it back. It never
 * mutates a document itself. The caller rehearses it with `plan`, reads the
 * collision log, and commits, exactly as if an author had written it. Nothing
 * here can produce geometry that the normal path could not, and nothing here
 * bypasses validation.
 *
 * WHAT IS NOT DONE HERE: layout. Mermaid describes a graph, not a drawing, and
 * inventing positions is a routing problem the engine deliberately leaves to
 * the author (`llm.md`: auto-routing, if added, must emit inspectable pen
 * commands). So this lays nodes on a simple top-to-bottom spine with one column
 * per rank, which is honest and inspectable, and says so. A caller who wants a
 * different arrangement moves the boxes — they are ordinary boxes.
 */

/** Mermaid node bracket syntax -> the symbol it means here. */
const NODE_SHAPES = Object.freeze([
  // Order matters: the longest delimiters must be tried first, or `([x])`
  // matches the `[x]` rule and silently becomes a process box.
  { open: '([', close: '])', shape: 'terminator' },
  { open: '[(', close: ')]', shape: 'data' },
  { open: '[[', close: ']]', shape: 'subprocess' },
  { open: '[/', close: '/]', shape: 'io' },
  { open: '[\\', close: '\\]', shape: 'manual' },
  { open: '{{', close: '}}', shape: 'prep' },
  { open: '{', close: '}', shape: 'decision' },
  { open: '(', close: ')', shape: 'terminator' },
  { open: '[', close: ']', shape: 'process' },
]);

const EDGE = /^(.+?)\s*(-->|---|-\.->|==>)\s*(?:\|([^|]*)\|\s*)?(.+)$/;

function stripQuotes(s) {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

/**
 * Parse one node reference: `id`, or `id[Label]`, or `id{Label}`.
 *
 * A bare id is legal Mermaid and refers to a node declared elsewhere — or to
 * one that is never given a label at all, which stays a process box.
 */
export function parseNodeRef(text) {
  const raw = text.trim();
  const match = /^([A-Za-z0-9_-]+)/.exec(raw);
  if (!match) throw new SyntaxError(`mermaid: cannot read a node id from "${raw}"`);
  const id = match[1];
  const rest = raw.slice(id.length).trim();
  if (!rest) return { id, label: null, shape: null };

  for (const { open, close, shape } of NODE_SHAPES) {
    if (rest.startsWith(open) && rest.endsWith(close)) {
      return { id, label: stripQuotes(rest.slice(open.length, rest.length - close.length)), shape };
    }
  }
  throw new SyntaxError(`mermaid: unrecognised node shape in "${raw}"`);
}

/**
 * Parse a `flowchart` / `graph` block into nodes and edges.
 *
 * Deliberately narrow. Subgraphs, class/style directives, click handlers and
 * link styling are refused by name rather than skipped, because silently
 * dropping half a diagram and reporting success is exactly the behaviour this
 * project treats as a defect.
 */
export function parseMermaidFlowchart(source) {
  const nodes = new Map();
  const edges = [];
  let seenHeader = false;

  const noteNode = (ref) => {
    const existing = nodes.get(ref.id);
    if (!existing) {
      nodes.set(ref.id, { id: ref.id, label: ref.label ?? ref.id, shape: ref.shape ?? 'process' });
      return;
    }
    // A later mention carrying a label or shape refines the earlier bare one.
    if (ref.label != null) existing.label = ref.label;
    if (ref.shape != null) existing.shape = ref.shape;
  };

  for (const rawLine of String(source).split(/\r?\n/)) {
    const line = rawLine.replace(/%%.*$/, '').trim();
    if (!line) continue;

    if (/^(flowchart|graph)\b/i.test(line)) { seenHeader = true; continue; }
    if (/^(subgraph|end|classDef|class|style|linkStyle|click)\b/i.test(line)) {
      throw new SyntaxError(
        `mermaid: "${line.split(/\s+/)[0]}" is not supported by this importer. `
        + 'Rather than drop part of the diagram and report success, the import refuses. '
        + 'Remove the unsupported lines, or build that part with place_box directly.',
      );
    }

    const edge = EDGE.exec(line);
    if (edge) {
      const [, from, , label, to] = edge;
      const a = parseNodeRef(from);
      const b = parseNodeRef(to);
      noteNode(a); noteNode(b);
      edges.push({ from: a.id, to: b.id, label: label ? stripQuotes(label) : null });
      continue;
    }
    noteNode(parseNodeRef(line));
  }

  if (!seenHeader) {
    throw new SyntaxError('mermaid: expected a "flowchart" or "graph" header line');
  }
  if (!nodes.size) throw new SyntaxError('mermaid: no nodes found');
  return { kind: 'flowchart', nodes: [...nodes.values()], edges };
}

function semanticId(value, fallback, used) {
  const base = String(value ?? '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function timelinePeriod(value) {
  const parts = String(value).split(/\s+(?:--|to|–|—)\s+/i).map((entry) => entry.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const iso = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
  return parts.every((entry) => iso.test(entry)) ? parts : null;
}

/** Parse Mermaid's semantic timeline syntax without inventing machine dates. */
export function parseMermaidTimeline(source) {
  const lines = String(source).split(/\r?\n/);
  const first = lines.findIndex((raw) => raw.replace(/%%.*$/, '').trim());
  if (first < 0 || !/^timeline\s*$/i.test(lines[first].replace(/%%.*$/, '').trim())) {
    throw new SyntaxError('mermaid: expected a "timeline" header line');
  }
  const events = [];
  const phases = [];
  const eventIds = new Set();
  const phaseIds = new Set();
  let title = 'Mermaid timeline';
  let currentPhase = null;
  let previousPeriod = null;

  const addEvent = (period, details, lineNumber) => {
    if (!period) throw new SyntaxError(`mermaid timeline line ${lineNumber}: an indented ": event" needs a dated or labelled period before it`);
    if (!details.length || !details[0]) throw new SyntaxError(`mermaid timeline line ${lineNumber}: event text is required after ":"`);
    const eventTitle = details[0];
    const event = {
      id: semanticId(eventTitle, `event-${events.length + 1}`, eventIds),
      title: eventTitle,
      ...(details.length > 1 ? { description: details.slice(1).join(' · ') } : {}),
      ...(currentPhase ? { phase: currentPhase } : {}),
      sequence: events.length + 1,
    };
    const range = timelinePeriod(period);
    if (range) {
      event.type = 'period';
      event.startDate = range[0];
      event.endDate = range[1];
      event.displayDate = period;
    } else if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(period)) {
      event.date = period;
      event.displayDate = period;
    } else {
      event.displayDate = period;
      if (/^current|now$/i.test(period)) {
        event.current = true;
        event.status = 'current';
      }
    }
    events.push(event);
  };

  for (let index = first + 1; index < lines.length; index++) {
    const line = lines[index].replace(/%%.*$/, '').trim();
    if (!line) continue;
    if (/^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/i.test(line)) {
      throw new SyntaxError(
        `mermaid timeline: "${line.split(/\s+/)[0]}" is not supported. `
        + 'The importer refuses directives it cannot preserve instead of silently dropping them.',
      );
    }
    const titleMatch = /^title\s+(.+)$/i.exec(line);
    if (titleMatch) {
      title = stripQuotes(titleMatch[1]);
      continue;
    }
    const sectionMatch = /^section\s+(.+)$/i.exec(line);
    if (sectionMatch) {
      const sectionTitle = stripQuotes(sectionMatch[1]);
      currentPhase = semanticId(sectionTitle, `phase-${phases.length + 1}`, phaseIds);
      phases.push({ id: currentPhase, title: sectionTitle });
      continue;
    }
    if (/^section\s*$/i.test(line)) throw new SyntaxError(`mermaid timeline line ${index + 1}: section needs a title`);

    const continuation = /^:\s*(.+)$/.exec(line);
    if (continuation) {
      const details = continuation[1].split(/\s*:\s*/).map(stripQuotes).filter(Boolean);
      addEvent(previousPeriod, details, index + 1);
      continue;
    }
    const parts = line.split(/\s*:\s*/).map(stripQuotes);
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new SyntaxError(`mermaid timeline line ${index + 1}: expected "period : event" — got "${line}"`);
    }
    previousPeriod = parts[0];
    addEvent(previousPeriod, parts.slice(1), index + 1);
  }
  if (!events.length) throw new SyntaxError('mermaid timeline: no events found');
  return { kind: 'timeline', title, events, phases };
}

/** Dispatch by the Mermaid header so callers have one import entry point. */
export function parseMermaid(source) {
  const header = String(source).split(/\r?\n/)
    .map((line) => line.replace(/%%.*$/, '').trim())
    .find(Boolean) ?? '';
  return /^timeline\s*$/i.test(header) ? parseMermaidTimeline(source) : parseMermaidFlowchart(source);
}

/** Longest-path rank, so an edge always points from a lower rank to a higher. */
function ranksOf(nodes, edges) {
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  // Bounded relaxation: a cycle cannot raise a rank forever.
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) {
      const next = rank.get(e.from) + 1;
      if (next > rank.get(e.to)) { rank.set(e.to, next); moved = true; }
    }
    if (!moved) break;
  }
  return rank;
}

/**
 * Compile a Mermaid flowchart into TurtlePen operations.
 *
 * Returns operations only. The caller feeds them to `plan`, reads the log, and
 * decides — so an import is subject to exactly the same validation as anything
 * an author draws by hand.
 */
export function mermaidToOperations(source, {
  page = 'base', nodeWidth = 26, nodeHeight = 8, gapY = 5, gapX = 4, originCol = 3, originRow = 3,
  timelineId = null, orientation = 'vertical', timelineLayout = 'alternating', spacing = 'ordinal', at = 'C4', spanCells = null,
} = {}) {
  const parsed = parseMermaid(source);
  if (parsed.kind === 'timeline') {
    const used = new Set();
    const id = timelineId ?? semanticId(parsed.title, 'mermaid-timeline', used);
    return {
      operations: [{
        op: 'timeline', action: 'create', id, title: parsed.title, page, at,
        orientation, layout: timelineLayout, spacing,
        ...(spanCells != null ? { spanCells } : {}),
        events: parsed.events,
        phases: parsed.phases,
      }],
      timeline: { id, title: parsed.title, events: parsed.events.length, phases: parsed.phases.length },
      nodes: 0,
      edges: 0,
      notes: ['Mermaid timeline semantics were preserved as one timeline operation. Rehearse it with plan; it expands into ordinary editable TurtlePen primitives.'],
    };
  }
  const { nodes, edges } = parsed;
  const rank = ranksOf(nodes, edges);

  const byRank = new Map();
  for (const n of nodes) {
    const r = rank.get(n.id);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(n);
  }

  const colLetter = (c) => {
    let s = '';
    while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  };

  const ops = [];
  const placed = new Map();
  for (const [r, group] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    group.forEach((n, i) => {
      const col = originCol + i * (nodeWidth + gapX);
      const row = originRow + r * (nodeHeight + gapY);
      placed.set(n.id, { col, row });
      ops.push({
        op: 'place_box',
        page,
        id: n.id,
        at: `${colLetter(col)}${row}`,
        span: `${nodeWidth}x${nodeHeight}`,
        label: n.label,
        shape: n.shape,
        align: 'center',
      });
    });
  }

  for (const [i, e] of edges.entries()) {
    const from = placed.get(e.from);
    const to = placed.get(e.to);
    // Same column and strictly downward is the one case a straight run is
    // certain to arrive on. Anything else is left to the author rather than
    // guessed at, and is reported below.
    const straight = from.col === to.col && to.row > from.row;
    ops.push({
      op: 'pen',
      page,
      id: `e${i + 1}_${e.from}_${e.to}`,
      program: straight
        ? `pen from ${e.from}.S\ndown line to ${e.to}.N arrow`
        : `pen from ${e.from}.S\ndown line to ${e.to}.N arrow`,
      _straight: straight,
    });
    if (e.label) {
      ops.push({
        op: 'pen',
        page,
        id: `l${i + 1}_${e.from}_${e.to}`,
        program: `text "${e.label.replace(/"/g, "'")}" at ${colLetter(to.col + nodeWidth + 1)}${to.row - 2} span 6x2 align center`,
      });
    }
  }

  const crooked = ops.filter((o) => o._straight === false).length;
  for (const o of ops) delete o._straight;

  return {
    operations: ops,
    nodes: nodes.length,
    edges: edges.length,
    // Said out loud rather than hidden: the importer places a spine, it does
    // not route. Edges that are not a straight drop will very likely raise
    // L016 or L004 and need the author to reroute them.
    notes: crooked
      ? [`${crooked} edge(s) do not run straight down a column. The importer lays out a spine; `
        + 'it does not route. Rehearse with plan and expect to reroute those by hand.']
      : [],
  };
}
