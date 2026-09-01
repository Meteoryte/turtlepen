#!/usr/bin/env node
/** Build a practical HVAC condenser replacement workflow through real MCP stdio. */

import { createMcpClient } from './mcp-client.js';

const client = createMcpClient({ createdAt: '2026-08-17T00:00:00.000Z' });

async function call(name, args = {}) {
  const result = await client.call(name, args);
  if (result.isError) throw new Error(`${name}: ${result.error ?? result.text}`);
  return result.text;
}

const box = (id, at, span, label, fill, corner = 'rounded') => ({
  op: 'place_box', id, at, span, label, fill, corner, align: 'left', fontSize: 10,
});

const path = (id, program, color = '#34444d') => ({
  op: 'pen', id, program, role: 'connector', color, width: 3, cap: 'square',
});

const operations = [
  box('title', 'C2.tl', '94x4',
    'CONDENSER REPLACEMENT | FIELD WORKFLOW', '#dce9ee', 'chamfered'),
  box('safety-boundary', 'C7.tl', '94x6',
    'QUALIFIED HVAC PERSONNEL ONLY | Use the equipment instructions, adopted codes, electrical safe-work practices, refrigerant rules, and site policy. Stop when a hold point is not proven. Do not substitute this sequence for required procedures or values.',
    '#f5edce', 'square'),

  box('confirm', 'C15.tl', '54x7',
    '0 | CONFIRM SCOPE AND EQUIPMENT\nMatch model, voltage, phase, MCA/MOCP, refrigerant, capacity, and approved indoor-system compatibility. Read OEM instructions. Record nameplates and existing condition. Photos P01-P03.',
    '#e8edf0'),
  box('isolate', 'C25.tl', '54x7',
    '1 | ISOLATE ALL ENERGY\nIdentify every electrical source, controls, and stored energy. Open disconnect and breaker, apply lockout/tagout, and prove absence of voltage with a rated meter using the required verification method. Photo P04.',
    '#f4e3df'),
  box('recover', 'C35.tl', '54x7',
    '2 | RECOVER REFRIGERANT\nIdentify the refrigerant. Use compatible recovery equipment and the correct rated cylinder. Track cylinder limits and record recovered weight. Do not vent. Confirm safe system pressure before opening the circuit. Photos P05-P06.',
    '#e3edf4'),
  box('remove-old', 'C45.tl', '54x7',
    '3 | DOCUMENT AND REMOVE OLD UNIT\nLabel conductors and controls before disconnecting. Protect the circuit from contamination. Disconnect piping using the approved method, cap open ends, release anchors, and move the unit with a planned lift. Photos P07-P09.',
    '#f3eadf'),
  box('prepare', 'C55.tl', '54x7',
    '4 | PREPARE SITE AND NEW EQUIPMENT\nVerify pad, drainage, service access, airflow clearances, line-set condition and sizing, electrical components, overcurrent protection, disconnect, and approved accessories. Correct defects before setting the unit. Photos P10-P11.',
    '#e9ece5'),
  box('install', 'C65.tl', '54x7',
    '5 | SET, CONNECT, AND BRAZE\nLevel and secure the condenser. Route tubing without strain or rub points. Flow nitrogen while brazing where required. Make electrical and control connections to the diagram; torque and protect conductors as specified. Photos P12-P14.',
    '#e3efe8'),
  box('test-charge', 'C75.tl', '54x7',
    '6 | PRESSURE TEST, EVACUATE, AND CHARGE\nPressure-test and leak-check using approved gas, equipment, limits, and hold time. Evacuate with clean tools and verify the required standing/decay result. Open service valves and establish charge by the approved method. Photos P15-P16.',
    '#e4e9f3'),
  box('commission', 'C85.tl', '54x9',
    '7 | START, VERIFY, AND HAND OFF\nRemove lockout/tagout under the authorized process and energize. Verify rotation where applicable, voltage, current, temperatures, pressures, airflow, drainage, controls, and abnormal sound/vibration. Label, clean, document, and brief the customer. Photos P17-P20.',
    '#ece6f0'),

  box('work-rule', 'BK15.tl', '32x7',
    'WORK RULE\nRead one numbered stage. Complete it. Capture its photos. Prove its hold point. Then continue. Never rely on remembering a later step.',
    '#eef0ed', 'chamfered'),
  box('hold-electrical', 'BK25.tl', '32x7',
    'HOLD A | ELECTRICAL\nPROCEED only when all applicable line terminals are proven de-energized and the energy-control boundary is secure. If not proven: STOP.',
    '#f7ddd8', 'chamfered'),
  box('hold-recovery', 'BK35.tl', '32x9',
    'HOLD B | REFRIGERANT\nPROCEED only when recovery is complete, cylinder status and weight are documented, and circuit pressure is safe for the planned opening. If not: CONTINUE RECOVERY.',
    '#f7e8d2', 'chamfered'),
  box('hold-leak', 'BK65.tl', '32x7',
    'HOLD C | LEAK TEST\nPROCEED only when the specified pressure test and leak inspection pass. If pressure changes or a leak is found: LOCATE, REPAIR, AND REPEAT.',
    '#f7e8d2', 'chamfered'),
  box('hold-vacuum', 'BK75.tl', '32x7',
    'HOLD D | EVACUATION\nPROCEED only when the required evacuation and standing/decay result are met. If not: DIAGNOSE LEAKS, MOISTURE, OR TOOL SETUP, THEN REPEAT.',
    '#f7e8d2', 'chamfered'),

  box('footer', 'C95.tl', '94x7',
    'SPECIAL REFRIGERANT CHECK | When the equipment or refrigerant has flammability or other special handling requirements, identify that condition before work, control ignition sources, ventilate as required, and use listed compatible service equipment. Record final readings, charge basis, recovered/added weight, model/serial, and all P01-P20 images.',
    '#e8edf0', 'square'),

  path('flow-0-1', 'pen from confirm.S\ndown line to isolate.N arrow'),
  path('flow-1-2', 'pen from isolate.S\ndown line to recover.N arrow'),
  path('flow-2-3', 'pen from recover.S\ndown line to remove-old.N arrow'),
  path('flow-3-4', 'pen from remove-old.S\ndown line to prepare.N arrow'),
  path('flow-4-5', 'pen from prepare.S\ndown line to install.N arrow'),
  path('flow-5-6', 'pen from install.S\ndown line to test-charge.N arrow'),
  path('flow-6-7', 'pen from test-charge.S\ndown line to commission.N arrow'),
  path('hold-a-link', 'pen from isolate.E\nright line to hold-electrical.W arrow', '#a33e32'),
  path('hold-b-link', 'pen from recover.E\nright line to hold-recovery.W arrow', '#9a642e'),
  path('hold-c-link', 'pen from install.E\nright line to hold-leak.W arrow', '#9a642e'),
  path('hold-d-link', 'pen from test-charge.E\nright line to hold-vacuum.W arrow', '#9a642e'),
];

try {
  const initialized = await client.init();
  if (initialized.result?.serverInfo?.name !== 'turtlepen') throw new Error('unexpected MCP server');

  await call('new_diagram', {
    name: 'Condenser replacement field workflow',
    path: 'diagrams/condenser-replacement-field-guide.turtlepen.json',
    cols: 100,
    rows: 102,
    fontSize: 10,
  });

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  process.stdout.write('rehearsal passed\n');

  const committed = await call('plan', { operations, commit: true });
  if (/plan FAILED/.test(committed)) throw new Error(committed);
  process.stdout.write(`committed ${operations.length} operations\n`);

  const validation = JSON.parse(await call('validate', { format: 'json' }));
  const blocking = validation.open.filter((finding) => ['S0', 'S1', 'S2'].includes(finding.severity));
  if (blocking.length) {
    throw new Error(`field guide has ${blocking.length} unresolved finding(s):\n${blocking.map((finding) => `${finding.rule} ${finding.message}`).join('\n')}`);
  }

  await call('render', {
    path: 'diagrams/condenser-replacement-field-guide.svg',
    bounds: 'content',
    showGrid: true,
    markFindings: false,
    margin: 20,
  });
  await call('save');
  process.stdout.write(`validation: ${validation.summary.verdict}; open INFO: ${validation.open.length}\n`);
  process.stdout.write('wrote diagrams/condenser-replacement-field-guide.turtlepen.json\n');
  process.stdout.write('wrote diagrams/condenser-replacement-field-guide.svg\n');
} finally {
  await client.close();
}
