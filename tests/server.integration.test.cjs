const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');

const PORT = 32137;
const ORIGIN = 'https://trusted.example';
const TOKEN = 'integration-test-access-token-32-characters';
let server;
let serverError = '';

async function waitForServer() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready (exit ${server?.exitCode}). ${serverError}`);
}

test.before(async () => {
  server = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      GEMINI_API_KEY: 'integration-placeholder',
      API_ACCESS_TOKEN: TOKEN,
      ALLOWED_ORIGINS: ORIGIN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', chunk => { serverError += chunk.toString(); });
  await waitForServer();
});

test.after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await new Promise(resolve => server.once('exit', resolve));
});

test('allows the configured origin and rejects an attacker origin', async () => {
  const allowed = await fetch(`http://127.0.0.1:${PORT}/api/health`, { headers: { Origin: ORIGIN } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);

  const rejected = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);

  const prefixBypass = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
    headers: { Origin: `${ORIGIN}.attacker.example` },
  });
  assert.equal(prefixBypass.status, 403);
});

test('requires authentication before image request validation', async () => {
  const body = JSON.stringify({ image: 'bad', lights: [] });
  const unauthorized = await fetch(`http://127.0.0.1:${PORT}/api/edit-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body,
  });
  assert.equal(unauthorized.status, 401);

  const directUnauthorized = await fetch(`http://127.0.0.1:${PORT}/api/edit-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assert.equal(directUnauthorized.status, 401);

  const authorized = await fetch(`http://127.0.0.1:${PORT}/api/edit-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body,
  });
  assert.equal(authorized.status, 400);
  assert.match((await authorized.json()).error, /Invalid image format/);
});

test('production server fails closed without an access token', async () => {
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(PORT + 1),
      GEMINI_API_KEY: 'integration-placeholder',
      API_ACCESS_TOKEN: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const exitCode = await new Promise(resolve => child.once('exit', resolve));
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /API_ACCESS_TOKEN is required in production/);
});
