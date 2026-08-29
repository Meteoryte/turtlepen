#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createMcpClient } from './mcp-client.js';

const mcp = createMcpClient({ createdAt: '2026-08-29T23:15:00.000Z' });
await mcp.init();

async function call(name, args = {}) {
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
  return body;
}

try {
  const queries = [
    'drawing from a source trace reference recognizable real object',
    'place_reference authoring reference trace remove page',
    'artwork freeform organic illustration',
    'artwork path curves curve arc circle polygon triangle disc',
    'pen program ray turn arc turtle commands drawing',
    'paint cells filled artwork scan convert shape',
    'layers overlay illustration page intent z order',
    'text measure font wordmark typography',
    'image trace simplify dither embed reference difference',
    'render showGrid background transparent crop bounds margin',
    'perceptual_review look render review workflow',
    'inspect artwork geometry bounds',
    'group transform rotate scale duplicate array artwork',
    'path_edit normalize_path offset_path stroke_to_path',
    'boolean slice artwork illustration',
  ];

  const chunks = [];
  chunks.push('# TurtlePen MCP help — artistic logo rebuild\n');
  chunks.push('## Orientation\n\n```text\n' + await call('turtlepen_help', { section:'orientation' }) + '\n```\n');
  for (const query of queries) {
    chunks.push(`## ${query}\n\n\`\`\`text\n${await call('search_help', { query })}\n\`\`\`\n`);
  }
  writeFileSync('brand/logo-art-help.md', chunks.join('\n'));
} finally {
  await mcp.close();
}
