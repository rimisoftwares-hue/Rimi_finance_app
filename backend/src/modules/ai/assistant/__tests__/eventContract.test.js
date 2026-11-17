'use strict';

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { SERVER_EVENTS, CLIENT_EVENTS, WS_CLOSE_CODES } = require('../config/eventContract');

const FRONTEND_EVENTS_FILE = path.resolve(
  __dirname,
  '../../../../../../frontend/src/services/aiAssistant.events.ts'
);

/** Extracts `KEY: 'value'` pairs from a `export const NAME = { ... } as const;` block. */
function parseTsConstObject(source, constName) {
  const re = new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\} as const;`);
  const m = source.match(re);
  assert.ok(m, `Could not find "export const ${constName}" in frontend events file`);
  const out = {};
  const pairRe = /([A-Z_]+)\s*:\s*(?:'([^']+)'|(\d+))/g;
  let p;
  while ((p = pairRe.exec(m[1])) !== null) {
    out[p[1]] = p[2] !== undefined ? p[2] : Number(p[3]);
  }
  return out;
}

test('Event contract: frontend aiAssistant.events.ts mirrors backend eventContract.js exactly', () => {
  assert.ok(fs.existsSync(FRONTEND_EVENTS_FILE), `Missing ${FRONTEND_EVENTS_FILE}`);
  const src = fs.readFileSync(FRONTEND_EVENTS_FILE, 'utf8');

  assert.deepEqual(parseTsConstObject(src, 'SERVER_EVENTS'), { ...SERVER_EVENTS });
  assert.deepEqual(parseTsConstObject(src, 'CLIENT_EVENTS'), { ...CLIENT_EVENTS });
  assert.deepEqual(parseTsConstObject(src, 'WS_CLOSE_CODES'), { ...WS_CLOSE_CODES });
});

test('Event contract: gateway and hook only use event names from the shared contract', () => {
  const gatewaySrc = fs.readFileSync(path.resolve(__dirname, '../gateway/assistantWs.gateway.js'), 'utf8');
  // No hard-coded `type: '...'` literals left in the gateway: everything goes through the contract
  assert.equal(/type:\s*'[a-z_.]+'/.test(gatewaySrc), false, 'gateway must use SERVER_EVENTS constants');

  const hookSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../../../../frontend/src/hooks/useAIAssistant.ts'),
    'utf8'
  );
  const allowed = new Set([...Object.values(SERVER_EVENTS), ...Object.values(CLIENT_EVENTS)]);
  const literalTypes = [...hookSrc.matchAll(/type:\s*'([a-z_.]+)'/g)].map((m) => m[1]);
  for (const t of literalTypes) {
    assert.ok(allowed.has(t), `useAIAssistant.ts uses unknown event type literal "${t}"`);
  }
});

