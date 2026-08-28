/**
 * Strict SVG-to-lattice compiler.
 *
 * This is intentionally a compiler for a small, exact subset rather than an
 * SVG sanitizer that preserves arbitrary markup. Nothing from the source SVG is
 * emitted verbatim: accepted rectangles become painted quadrant paths, and
 * accepted 5px strokes become rasterised quadrant paths. Unsupported geometry,
 * transforms, styles, resources, and active content fail by name instead of
 * silently changing what the author supplied.
 */

import { PX_PER_QUAD, boundsOf, rect } from './geometry.js';
import { rayQuads } from './raster.js';

export const SVG_IMPORT_QUANTIZATION = Object.freeze(['reject', 'nearest']);
export const MAX_SVG_IMPORT_BYTES = 1_000_000;
export const MAX_SVG_IMPORT_ELEMENTS = 1_000;
export const MAX_SVG_IMPORT_QUADRANTS = 250_000;

const ID_RE = /^[A-Za-z0-9_-]+$/;
const SOURCE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const NUMBER_RE = /^[-+]?(?:(?:\d+\.\d*)|(?:\.\d+)|\d+)/;
const TAG_RE = /^[A-Za-z][A-Za-z0-9:._-]*$/;

const CONTAINER_TAGS = new Set(['svg', 'g']);
const SHAPE_TAGS = new Set(['rect', 'line', 'polyline', 'polygon', 'path']);
const SUPPORTED_TAGS = new Set([...CONTAINER_TAGS, ...SHAPE_TAGS]);

const ROOT_ATTRIBUTES = new Set(['xmlns', 'xmlns:xlink', 'version', 'width', 'height', 'viewbox', 'id']);
const GROUP_ATTRIBUTES = new Set(['id']);
const RECT_ATTRIBUTES = new Set(['id', 'x', 'y', 'width', 'height', 'fill', 'stroke']);
const STROKE_ATTRIBUTES = new Set([
  'id', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
]);
const LINE_ATTRIBUTES = new Set([...STROKE_ATTRIBUTES, 'x1', 'y1', 'x2', 'y2']);
const POINT_ATTRIBUTES = new Set([...STROKE_ATTRIBUTES, 'points']);
const PATH_ATTRIBUTES = new Set([...STROKE_ATTRIBUTES, 'd']);

function sourceBytes(source) {
  return new TextEncoder().encode(source).byteLength;
}

function assertSource(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new TypeError('SVG source must be non-empty text beginning with <svg>');
  }
  const bytes = sourceBytes(source);
  if (bytes > MAX_SVG_IMPORT_BYTES) {
    throw new RangeError(`SVG source is ${bytes} bytes, over the ${MAX_SVG_IMPORT_BYTES} byte import limit`);
  }
  return source;
}

function assertPrefix(prefix) {
  const value = String(prefix ?? 'svg');
  if (!ID_RE.test(value)) {
    throw new SyntaxError(`SVG import prefix "${prefix}" must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  return value;
}

function assertQuantization(quantize) {
  if (!SVG_IMPORT_QUANTIZATION.includes(quantize)) {
    throw new SyntaxError(`SVG import quantize must be ${SVG_IMPORT_QUANTIZATION.join(' or ')} — got ${JSON.stringify(quantize)}`);
  }
  return quantize;
}

function unsupported(message) {
  throw new SyntaxError(`SVG import does not support ${message}`);
}

function readTag(source, start) {
  let quote = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const ch = source[index];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }
    if (ch === '<') throw new SyntaxError('SVG markup has a nested "<" inside a tag');
    if (ch === '>') return { raw: source.slice(start, index + 1), end: index + 1 };
  }
  throw new SyntaxError('SVG markup has an unclosed tag');
}

function parseAttributes(source, tag) {
  const attributes = Object.create(null);
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (index >= source.length) break;
    const nameMatch = /^[A-Za-z_:][A-Za-z0-9:._-]*/.exec(source.slice(index));
    if (!nameMatch) throw new SyntaxError(`SVG <${tag}> has malformed attributes`);
    const rawName = nameMatch[0];
    const name = rawName.toLowerCase();
    index += rawName.length;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') throw new SyntaxError(`SVG <${tag}> attribute "${rawName}" needs a quoted value`);
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quote = source[index];
    if (quote !== '"' && quote !== '\'') throw new SyntaxError(`SVG <${tag}> attribute "${rawName}" needs a quoted value`);
    index += 1;
    const end = source.indexOf(quote, index);
    if (end < 0) throw new SyntaxError(`SVG <${tag}> attribute "${rawName}" has an unclosed value`);
    const value = source.slice(index, end);
    if (value.includes('<')) throw new SyntaxError(`SVG <${tag}> attribute "${rawName}" contains markup`);
    if (Object.hasOwn(attributes, name)) throw new SyntaxError(`SVG <${tag}> repeats attribute "${rawName}"`);
    attributes[name] = value;
    index = end + 1;
  }
  return attributes;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let sawDeclaration = false;
  while (index < source.length) {
    const next = source.indexOf('<', index);
    if (next < 0) {
      if (/\S/.test(source.slice(index))) tokens.push({ type: 'text' });
      break;
    }
    if (/\S/.test(source.slice(index, next))) tokens.push({ type: 'text' });

    if (source.startsWith('<!--', next)) {
      const end = source.indexOf('-->', next + 4);
      if (end < 0) throw new SyntaxError('SVG markup has an unclosed comment');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<?', next)) {
      const end = source.indexOf('?>', next + 2);
      if (end < 0) throw new SyntaxError('SVG markup has an unclosed processing instruction');
      const instruction = source.slice(next + 2, end).trim();
      if (sawDeclaration || tokens.length || !/^xml(?:\s|$)/i.test(instruction)) {
        throw new SyntaxError('SVG import accepts only one leading XML declaration');
      }
      sawDeclaration = true;
      index = end + 2;
      continue;
    }
    if (source.startsWith('<!', next)) {
      throw new SyntaxError('SVG import refuses declarations, entities, and CDATA');
    }

    const { raw, end } = readTag(source, next);
    const body = raw.slice(1, -1).trim();
    if (body.startsWith('/')) {
      const name = body.slice(1).trim().toLowerCase();
      if (!TAG_RE.test(name)) throw new SyntaxError('SVG markup has a malformed closing tag');
      tokens.push({ type: 'close', name });
    } else {
      const selfClosing = /\/\s*$/.test(body);
      const inner = selfClosing ? body.replace(/\/\s*$/, '').trim() : body;
      const nameMatch = /^([A-Za-z][A-Za-z0-9:._-]*)([\s\S]*)$/.exec(inner);
      if (!nameMatch) throw new SyntaxError('SVG markup has a malformed opening tag');
      const name = nameMatch[1].toLowerCase();
      if (!TAG_RE.test(name)) throw new SyntaxError('SVG markup has a malformed opening tag');
      tokens.push({
        type: 'open',
        name,
        attributes: parseAttributes(nameMatch[2], name),
        selfClosing,
      });
    }
    index = end;
  }
  return tokens;
}

function assertAttributes(tag, attributes, allowed) {
  for (const name of Object.keys(attributes)) {
    if (allowed.has(name)) continue;
    if (name.startsWith('on')) unsupported(`event handler attribute "${name}" on <${tag}>`);
    if (name === 'href' || name === 'xlink:href') unsupported(`external or linked resource attribute "${name}" on <${tag}>`);
    unsupported(`attribute "${name}" on <${tag}>`);
  }
}

function parseNumbers(value, what) {
  const input = String(value ?? '');
  const values = [];
  let index = 0;
  while (index < input.length) {
    while (/[\s,]/.test(input[index] ?? '')) index += 1;
    if (index >= input.length) break;
    const match = NUMBER_RE.exec(input.slice(index));
    if (!match) throw new SyntaxError(`${what} must contain SVG numbers only — got ${JSON.stringify(value)}`);
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new RangeError(`${what} contains a non-finite number`);
    values.push(number);
    index += match[0].length;
  }
  if (!values.length) throw new SyntaxError(`${what} must contain at least one number`);
  return values;
}

function parseNumber(value, what) {
  const values = parseNumbers(value, what);
  if (values.length !== 1) throw new SyntaxError(`${what} must be one SVG number — got ${JSON.stringify(value)}`);
  return values[0];
}

function parseViewportNumber(value, what) {
  const match = /^([-+]?(?:(?:\d+\.\d*)|(?:\.\d+)|\d+))(?:px)?$/i.exec(String(value ?? '').trim());
  if (!match) throw new SyntaxError(`${what} must be a unitless or px SVG number — got ${JSON.stringify(value)}`);
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${what} must be a positive number — got ${JSON.stringify(value)}`);
  return number;
}

function validateRoot(attributes, context) {
  assertAttributes('svg', attributes, ROOT_ATTRIBUTES);
  if (attributes.width != null) parseViewportNumber(attributes.width, 'SVG width');
  if (attributes.height != null) parseViewportNumber(attributes.height, 'SVG height');
  if (attributes.viewbox != null) {
    const viewBox = parseNumbers(attributes.viewbox, 'SVG viewBox');
    if (viewBox.length !== 4) throw new SyntaxError('SVG viewBox must contain x y width height');
    if (viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] <= 0 || viewBox[3] <= 0) {
      unsupported(`viewBox ${JSON.stringify(attributes.viewbox)}; only a 0 0 width height viewport has an exact lattice mapping`);
    }
    context.viewBox = { width: viewBox[2], height: viewBox[3] };
  }
}

function normalizeColor(value, what) {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) {
    unsupported(`${what} ${JSON.stringify(value)}; only 3- or 6-digit hex colours are exact`);
  }
  return value.toLowerCase();
}

function optionalNone(value) {
  return typeof value === 'string' && value.toLowerCase() === 'none';
}

function recordAdjustment(context, coordinate, sourcePx, emittedPx) {
  context.adjustments += 1;
  if (context.adjustmentList.length < 100) {
    context.adjustmentList.push({ coordinate, sourcePx, emittedPx });
  }
}

function quantizeBoundary(value, coordinate, context) {
  const units = value / PX_PER_QUAD;
  let result = units;
  if (!Number.isInteger(units)) {
    if (context.quantize === 'reject') {
      throw new RangeError(`${coordinate} ${value}px is not on a ${PX_PER_QUAD}px lattice boundary; use quantize:"nearest" only when that shift is intentional`);
    }
    result = Math.round(units);
    recordAdjustment(context, coordinate, value, result * PX_PER_QUAD);
  }
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${coordinate} is outside the safe integer lattice range`);
  }
  if (result < 0) throw new RangeError(`${coordinate} reaches ${result * PX_PER_QUAD}px, outside TurtlePen's top-left lattice boundary`);
  return result;
}

function quantizeCenter(value, coordinate, context) {
  const units = value / PX_PER_QUAD - 0.5;
  let result = units;
  if (!Number.isInteger(units)) {
    if (context.quantize === 'reject') {
      throw new RangeError(`${coordinate} ${value}px is not at a ${PX_PER_QUAD}px quadrant centre; use quantize:"nearest" only when that shift is intentional`);
    }
    result = Math.round(units);
    recordAdjustment(context, coordinate, value, (result + 0.5) * PX_PER_QUAD);
  }
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${coordinate} is outside the safe integer lattice range`);
  }
  if (result < 0) throw new RangeError(`${coordinate} reaches ${(result + 0.5) * PX_PER_QUAD}px, outside TurtlePen's top-left lattice`);
  return result;
}

function boundaryAttribute(attributes, name, context, { defaultValue = null, positive = false } = {}) {
  const raw = attributes[name];
  if (raw == null) {
    if (defaultValue == null) throw new SyntaxError(`SVG <rect> needs "${name}"`);
    return defaultValue;
  }
  const value = quantizeBoundary(parseNumber(raw, `SVG <rect> ${name}`), `SVG <rect> ${name}`, context);
  if (positive && value < 1) throw new RangeError(`SVG <rect> ${name} must cover at least one quadrant`);
  return value;
}

function pointAttribute(attributes, name, tag) {
  if (attributes[name] == null) throw new SyntaxError(`SVG <${tag}> needs "${name}"`);
  return parseNumber(attributes[name], `SVG <${tag}> ${name}`);
}

function sourceId(attributes) {
  return SOURCE_ID_RE.test(attributes.id ?? '') ? attributes.id : null;
}

function importedProvenance(tag, sourceIndex, attributes) {
  return {
    operation: 'svg_import',
    sourceElement: tag,
    sourceIndex,
    ...(sourceId(attributes) ? { sourceId: sourceId(attributes) } : {}),
  };
}

function pushSpec(context, spec) {
  if (context.elements.length >= MAX_SVG_IMPORT_ELEMENTS) {
    throw new RangeError(`SVG import has more than ${MAX_SVG_IMPORT_ELEMENTS} drawable elements`);
  }
  context.quadrants += spec.pieces.length;
  if (context.quadrants > MAX_SVG_IMPORT_QUADRANTS) {
    throw new RangeError(`SVG import would create ${context.quadrants} quadrants, over the ${MAX_SVG_IMPORT_QUADRANTS} quadrant safety limit`);
  }
  context.elements.push(spec);
}

function assertCapacity(context, count, what) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SVG_IMPORT_QUADRANTS - context.quadrants) {
    throw new RangeError(`${what} would exceed the ${MAX_SVG_IMPORT_QUADRANTS} quadrant safety limit`);
  }
}

function nextId(context) {
  return `${context.prefix}-${context.elements.length + 1}`;
}

function filledRectPieces(x, y, w, h) {
  const pieces = [];
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      pieces.push({ x: column, y: row, type: 'mark', style: 'square' });
    }
  }
  return pieces;
}

function compileRect(attributes, context, sourceIndex) {
  assertAttributes('rect', attributes, RECT_ATTRIBUTES);
  if (attributes.stroke != null && !optionalNone(attributes.stroke)) {
    unsupported('stroked <rect>; a centered SVG stroke cannot be represented as exact whole-quadrant fill geometry');
  }
  if (optionalNone(attributes.fill)) unsupported('unfilled <rect>; use a 5px <path> or <polyline> for exact lattice outlines');
  const fill = normalizeColor(attributes.fill ?? '#000000', 'SVG <rect> fill');
  const x = boundaryAttribute(attributes, 'x', context, { defaultValue: 0 });
  const y = boundaryAttribute(attributes, 'y', context, { defaultValue: 0 });
  const w = boundaryAttribute(attributes, 'width', context, { positive: true });
  const h = boundaryAttribute(attributes, 'height', context, { positive: true });
  if (x > Number.MAX_SAFE_INTEGER - w || y > Number.MAX_SAFE_INTEGER - h) {
    throw new RangeError('SVG <rect> extends outside the safe integer lattice range');
  }
  assertCapacity(context, w * h, 'SVG <rect>');
  pushSpec(context, {
    id: nextId(context),
    pieces: filledRectPieces(x, y, w, h),
    stroke: { color: fill, width: PX_PER_QUAD, cap: 'butt', paint: 'cells' },
    role: 'artwork',
    closed: true,
    provenance: importedProvenance('rect', sourceIndex, attributes),
  });
}

function strokeStyle(attributes, tag, { closed = false, segments = 1 } = {}) {
  if (attributes.fill != null && !optionalNone(attributes.fill)) {
    unsupported(`filled <${tag}>; only cell-filled <rect> is supported in this exact import subset`);
  }
  if (closed && !optionalNone(attributes.fill)) {
    unsupported(`closed <${tag}> without fill="none"; SVG's default fill cannot be represented by an open lattice stroke`);
  }
  if (attributes.stroke == null || optionalNone(attributes.stroke)) {
    throw new SyntaxError(`SVG <${tag}> needs a 5px hex "stroke"`);
  }
  const color = normalizeColor(attributes.stroke, `SVG <${tag}> stroke`);
  const width = attributes['stroke-width'] == null
    ? 1
    : parseNumber(attributes['stroke-width'], `SVG <${tag}> stroke-width`);
  if (width !== PX_PER_QUAD) {
    unsupported(`<${tag}> stroke-width ${width}px; only ${PX_PER_QUAD}px strokes have an exact quadrant footprint`);
  }
  const cap = (attributes['stroke-linecap'] ?? 'butt').toLowerCase();
  if (!['butt', 'round', 'square'].includes(cap)) {
    unsupported(`<${tag}> stroke-linecap ${JSON.stringify(attributes['stroke-linecap'])}`);
  }
  const join = (attributes['stroke-linejoin'] ?? 'miter').toLowerCase();
  if (segments > 1 && join !== 'round') {
    unsupported(`<${tag}> stroke-linejoin ${JSON.stringify(attributes['stroke-linejoin'] ?? 'miter')}; multi-segment imported paths must declare round joins`);
  }
  return { color, width: PX_PER_QUAD, cap };
}

function appendSegment(pieces, from, to, context, tag) {
  const start = {
    x: quantizeCenter(from.x, `SVG <${tag}> path x`, context),
    y: quantizeCenter(from.y, `SVG <${tag}> path y`, context),
  };
  const end = {
    x: quantizeCenter(to.x, `SVG <${tag}> path x`, context),
    y: quantizeCenter(to.y, `SVG <${tag}> path y`, context),
  };
  if (start.x === end.x && start.y === end.y) {
    unsupported(`zero-length <${tag}> segment; its cap cannot be preserved as lattice geometry`);
  }
  assertCapacity(
    context,
    pieces.length + Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) + 1,
    `SVG <${tag}> path`,
  );
  const raster = rayQuads(start.x, start.y, end.x, end.y);
  const previous = pieces.at(-1);
  for (const point of raster) {
    if (previous && point.x === previous.x && point.y === previous.y) continue;
    pieces.push({ x: point.x, y: point.y, type: 'mark', style: 'square' });
  }
}

function pathSpec(tag, attributes, points, closed, context, sourceIndex) {
  if (points.length < 2) throw new SyntaxError(`SVG <${tag}> needs at least two points`);
  const segmentCount = points.length - 1 + (closed ? 1 : 0);
  const stroke = strokeStyle(attributes, tag, { closed, segments: segmentCount });
  const pieces = [];
  for (let index = 1; index < points.length; index += 1) {
    appendSegment(pieces, points[index - 1], points[index], context, tag);
  }
  if (closed) appendSegment(pieces, points.at(-1), points[0], context, tag);
  if (!pieces.length) throw new SyntaxError(`SVG <${tag}> produced no drawable quadrant path`);
  pushSpec(context, {
    id: nextId(context),
    pieces,
    stroke,
    role: 'artwork',
    closed,
    provenance: importedProvenance(tag, sourceIndex, attributes),
  });
}

function compileLine(attributes, context, sourceIndex) {
  assertAttributes('line', attributes, LINE_ATTRIBUTES);
  pathSpec('line', attributes, [
    { x: pointAttribute(attributes, 'x1', 'line'), y: pointAttribute(attributes, 'y1', 'line') },
    { x: pointAttribute(attributes, 'x2', 'line'), y: pointAttribute(attributes, 'y2', 'line') },
  ], false, context, sourceIndex);
}

function parsePoints(value, context, tag) {
  const numbers = parseNumbers(value, `SVG <${tag}> points`);
  if (numbers.length < 4 || numbers.length % 2) {
    throw new SyntaxError(`SVG <${tag}> points must contain at least two x,y pairs`);
  }
  return Array.from({ length: numbers.length / 2 }, (_, index) => ({
    x: numbers[index * 2],
    y: numbers[index * 2 + 1],
  }));
}

function compilePoints(tag, attributes, context, sourceIndex) {
  assertAttributes(tag, attributes, POINT_ATTRIBUTES);
  pathSpec(tag, attributes, parsePoints(attributes.points, context, tag), tag === 'polygon', context, sourceIndex);
}

function tokenizePathData(value) {
  const source = String(value ?? '');
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    while (/[\s,]/.test(source[index] ?? '')) index += 1;
    if (index >= source.length) break;
    if (/[A-Za-z]/.test(source[index])) {
      tokens.push(source[index]);
      index += 1;
      continue;
    }
    const match = NUMBER_RE.exec(source.slice(index));
    if (!match) throw new SyntaxError(`SVG path data is malformed near ${JSON.stringify(source.slice(index, index + 20))}`);
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new RangeError('SVG path data contains a non-finite number');
    tokens.push(number);
    index += match[0].length;
  }
  if (!tokens.length) throw new SyntaxError('SVG <path> needs non-empty d data');
  return tokens;
}

function parsePathData(value) {
  const tokens = tokenizePathData(value);
  let index = 0;
  let command = null;
  let cursor = { x: 0, y: 0 };
  let start = null;
  let moved = false;
  let closed = false;
  const points = [];

  const nextNumber = (what) => {
    const token = tokens[index];
    if (typeof token !== 'number') throw new SyntaxError(`SVG path ${what} needs a number`);
    index += 1;
    return token;
  };
  const pair = (relative, what) => {
    const x = nextNumber(`${what} x`);
    const y = nextNumber(`${what} y`);
    return relative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
  };

  while (index < tokens.length) {
    if (typeof tokens[index] === 'string') {
      command = tokens[index];
      index += 1;
      if (!'MmLlHhVvZz'.includes(command)) unsupported(`path command "${command}"`);
      if (command === 'Z' || command === 'z') {
        if (!moved || !start) throw new SyntaxError('SVG path closes before its first move');
        if (closed) throw new SyntaxError('SVG path closes more than once');
        closed = true;
        cursor = { ...start };
        command = null;
      }
      continue;
    }
    if (!command) throw new SyntaxError('SVG path data has numbers without a drawing command');

    if (command === 'M' || command === 'm') {
      if (moved) unsupported('multiple <path> subpaths; import each contour as its own SVG path');
      cursor = pair(command === 'm', 'move');
      start = { ...cursor };
      points.push({ ...cursor });
      moved = true;
      command = command === 'm' ? 'l' : 'L';
      continue;
    }
    if (command === 'L' || command === 'l') {
      const next = pair(command === 'l', 'line');
      points.push(next);
      cursor = next;
      continue;
    }
    if (command === 'H' || command === 'h') {
      const value_ = nextNumber('horizontal line');
      cursor = { x: command === 'h' ? cursor.x + value_ : value_, y: cursor.y };
      points.push({ ...cursor });
      continue;
    }
    if (command === 'V' || command === 'v') {
      const value_ = nextNumber('vertical line');
      cursor = { x: cursor.x, y: command === 'v' ? cursor.y + value_ : value_ };
      points.push({ ...cursor });
      continue;
    }
    throw new SyntaxError(`SVG path command "${command}" is not supported`);
  }
  if (!moved || points.length < 2) throw new SyntaxError('SVG <path> needs a move followed by at least one line');
  return { points, closed };
}

function compilePath(attributes, context, sourceIndex) {
  assertAttributes('path', attributes, PATH_ATTRIBUTES);
  const parsed = parsePathData(attributes.d);
  pathSpec('path', attributes, parsed.points, parsed.closed, context, sourceIndex);
}

function compileShape(tag, attributes, context, sourceIndex) {
  switch (tag) {
    case 'rect': return compileRect(attributes, context, sourceIndex);
    case 'line': return compileLine(attributes, context, sourceIndex);
    case 'polyline':
    case 'polygon': return compilePoints(tag, attributes, context, sourceIndex);
    case 'path': return compilePath(attributes, context, sourceIndex);
    default: throw new Error(`unhandled SVG import tag "${tag}"`);
  }
}

/**
 * Compile a deliberately narrow SVG subset to standard TurtlePen path specs.
 *
 * Accepted source geometry:
 * - solid, unstroked rectangles whose edges sit on 5px boundaries;
 * - 5px hex-colour strokes with butt/round/square caps, and round joins when
 *   a polyline has a bend;
 * - line, polyline, polygon, and M/L/H/V/Z path commands.
 *
 * Every source coordinate is rejected unless it already maps exactly to a
 * lattice boundary (filled rects) or quadrant centre (strokes), unless the
 * caller explicitly chooses nearest quantization.
 */
export function compileSvg(source, { prefix = 'svg', quantize = 'reject' } = {}) {
  assertSource(source);
  const context = {
    prefix: assertPrefix(prefix),
    quantize: assertQuantization(quantize),
    elements: [],
    quadrants: 0,
    adjustments: 0,
    adjustmentList: [],
    viewBox: null,
    sourceTags: [],
  };
  const stack = [];
  let root = false;
  let sourceIndex = 0;

  for (const token of tokenize(source)) {
    if (token.type === 'text') throw new SyntaxError('SVG import supports geometry only; text nodes are not supported');
    if (token.type === 'close') {
      const expected = stack.pop();
      if (!expected) throw new SyntaxError(`SVG closes <${token.name}> without an opening tag`);
      if (expected !== token.name) throw new SyntaxError(`SVG closes <${token.name}> while <${expected}> is still open`);
      continue;
    }

    const { name, attributes, selfClosing } = token;
    if (!SUPPORTED_TAGS.has(name)) unsupported(`<${name}>`);
    if (stack.length && SHAPE_TAGS.has(stack.at(-1))) {
      throw new SyntaxError(`SVG <${stack.at(-1)}> cannot contain nested markup`);
    }
    if (!root) {
      if (name !== 'svg') throw new SyntaxError(`SVG root must be <svg>, not <${name}>`);
      root = true;
      validateRoot(attributes, context);
    } else if (name === 'svg') {
      throw new SyntaxError('SVG import accepts one root <svg>');
    } else if (!stack.length) {
      throw new SyntaxError(`SVG <${name}> appears after the root closed`);
    }

    if (name === 'g') assertAttributes('g', attributes, GROUP_ATTRIBUTES);
    if (SHAPE_TAGS.has(name)) {
      sourceIndex += 1;
      context.sourceTags.push(name);
      compileShape(name, attributes, context, sourceIndex);
    }
    if (!selfClosing) stack.push(name);
  }

  if (stack.length) throw new SyntaxError(`SVG <${stack.at(-1)}> is not closed`);
  if (!root) throw new SyntaxError('SVG source must have an <svg> root');
  if (!context.elements.length) throw new RangeError('SVG import found no supported drawable geometry');

  return {
    elements: context.elements,
    report: {
      format: 'lattice-svg-subset-v1',
      importedElements: context.elements.length,
      importedQuadrants: context.quadrants,
      sourceElements: context.sourceTags,
      ...(context.viewBox ? { viewBox: context.viewBox } : {}),
      quantization: {
        policy: context.quantize,
        adjustedCoordinates: context.adjustments,
        adjustments: context.adjustmentList,
        omittedAdjustments: Math.max(0, context.adjustments - context.adjustmentList.length),
      },
    },
  };
}

/** Compact, read-only report for deciding whether an SVG is safe to import. */
export function inspectSvg(source, options = {}) {
  const compiled = compileSvg(source, options);
  return {
    ...compiled.report,
    elements: compiled.elements.map((element) => ({
      id: element.id,
      sourceElement: element.provenance.sourceElement,
      sourceIndex: element.provenance.sourceIndex,
      ...(element.provenance.sourceId ? { sourceId: element.provenance.sourceId } : {}),
      role: element.role,
      closed: element.closed,
      paint: element.stroke.paint ?? 'line',
      color: element.stroke.color,
      quadrants: element.pieces.length,
      bounds: boundsOf(element.pieces.map((piece) => rect(piece.x, piece.y, 1, 1))),
    })),
  };
}
