#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createMcpClient } from './mcp-client.js';

const mcp = createMcpClient({ createdAt: '2026-08-29T23:17:00.000Z' });
await mcp.init();

async function call(name, args = {}) {
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
  return body;
}

try {
  const terms = [
    'artwork','pen','arc','circle','disc','polygon','triangle','text','measure',
    'page','overlay','layer','reference','image','render','perceptual_review',
    'inspect','group','transform','rotate','scale','duplicate','array','boolean',
    'slice','offset_path','stroke_to_path','path_edit','normalize_path','micro_mask',
    'annotate','ascii','view'
  ];

  const chunks = [];
  chunks.push('# TurtlePen MCP help — artistic logo rebuild\n');
  chunks.push('## Full TurtlePen manual\n\n```text\n' + await call('turtlepen_help', { section:'all' }) + '\n```\n');
  for (const query of terms) {
    chunks.push(`## search_help: ${query}\n\n\`\`\`text\n${await call('search_help', { query })}\n\`\`\`\n`);
  }
  writeFileSync('brand/logo-art-help.md', chunks.join('\n'));
} finally {
  await mcp.close();
}
