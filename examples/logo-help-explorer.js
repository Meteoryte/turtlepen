#!/usr/bin/env node
/**
 * Explore TurtlePen through its own MCP discovery surface before redesigning the logo.
 */
import { createMcpClient } from './mcp-client.js';

const mcp = createMcpClient({ createdAt: '2026-08-29T20:20:00.000Z' });
await mcp.init();

async function call(name, args = {}) {
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  console.log(`\n\n===== ${name} ${JSON.stringify(args)} =====\n${body}`);
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
  return body;
}

try {
  await call('turtlepen_help', { section: 'orientation' });
  await call('turtlepen_help', { section: 'all' });

  const queries = [
    '',
    'authoring',
    'artwork',
    'illustration',
    'shape',
    'curve',
    'color',
    'fill',
    'gradient',
    'stroke',
    'text',
    'font',
    'layer',
    'page',
    'image',
    'reference',
    'wireframe',
    'perspective',
    'layout',
    'group',
    'transform',
    'rotate',
    'scale',
    'boolean',
    'slice',
    'offset',
    'path',
    'array',
    'import svg',
    'perceptual',
    'review',
    'render',
    'theme',
    'view',
    'model',
    'annotate',
  ];

  for (const query of queries) {
    await call('search_help', { query });
  }
} finally {
  await mcp.close();
}
