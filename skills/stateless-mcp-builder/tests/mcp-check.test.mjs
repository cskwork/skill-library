/** Local protocol fixtures, not an official conformance or harness test suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, parseArgs, PROTOCOL, encodeHeader, headerBindings, argumentHeaders, readArguments } from '../scripts/mcp-check.mjs';
import { install } from '../scripts/install-skill.mjs';

const TOKEN = 'fixture-token-not-a-real-credential';
const info = { 'io.modelcontextprotocol/serverInfo': { name: 'fixture-api', version: '0.0.0-test' } };
const complete = result => ({ resultType: 'complete', _meta: info, ...result });
const healthTool = { name: 'system_health', description: 'Fixture-only read-only health.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } };
const discoverResult = () => complete({ supportedVersions: [PROTOCOL], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'private' });
const toolResult = () => complete({ content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true } });
function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
}
async function fixture(t, config = {}) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body;
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; }
      catch { return send(res, 400, { error: 'Fixture received invalid JSON.' }); }
      const event = { method: req.method, path: req.url, headers: req.headers, body };
      seen.push(event);
      if (config.intercept && await config.intercept(event, res, seen)) return;
      if (req.url === '/healthz' || req.url === '/prefix/healthz') return send(res, config.healthStatus || 200, { status: config.healthValue || 'ok' });
      if (req.url === '/readyz' || req.url === '/prefix/readyz') return send(res, config.readyStatus || 200, { status: config.readyValue || 'ready' });
      if (req.url !== '/mcp') return send(res, 404, { error: 'Not found' });
      if (!config.public && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, config.authStatus || 401,
        { error: `Never echo this upstream message: ${TOKEN}` }, config.noChallenge ? {} : { 'www-authenticate': 'Bearer realm="fixture"' });
      const id = config.wrongId ? 'wrong' : body.id;
      let result;
      if (body.method === 'server/discover') result = config.discovery ? config.discovery() : discoverResult();
      else if (body.method === 'tools/list') result = config.catalog ? config.catalog(body.params) : complete({ tools: [healthTool], ttlMs: 0, cacheScope: 'private' });
      else if (body.method === 'tools/call') result = config.tool ? config.tool(body.params) : toolResult();
      else return send(res, 404, { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method' } });
      const envelope = { jsonrpc: '2.0', id, result };
      if (config.sse) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const prefix = ': keepalive\r\n\r\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } }) + '\r\n\r\n';
        const json = JSON.stringify(envelope, null, 2).split('\n').map(line => `data: ${line}`).join('\r\n');
        const bytes = Buffer.from(prefix + json + '\r\n\r\n');
        // Deliberately split CRLF and multibyte UTF-8 across writes.
        for (let i = 0; i < bytes.length; i += 7) res.write(bytes.subarray(i, i + 7));
        res.end();
      } else send(res, 200, envelope, config.responseHeaders || {});
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'Fixture handler failed.' }); else res.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const env = { MCP_URL: url, APP_MCP_TOKEN: TOKEN };
  return { url, env, seen, server };
}
const doctorArgs = ['doctor', '--tool', 'system_health', '--allow-tool', 'system_health', '--require-auth'];
const callArgs = ['call', '--tool', 'system_health', '--allow-tool', 'system_health'];
const hasCode = (out, code) => out.report.diagnostic?.code === code || out.report.checks?.some(c => c.diagnostic?.code === code);

// Inputs and safeguards

test('help works without a configured endpoint or token', async () => {
  const out = await run(['--help'], {});
  assert.equal(out.exitCode, 0); assert.match(out.help, /Modern HTTP only/);
});
test('usage fails closed on missing token and missing call allowlist', async () => {
  const env = { MCP_URL: 'http://127.0.0.1:9/mcp' };
  assert.equal((await run(['list'], env)).exitCode, 2);
  assert.equal((await run(['call', '--tool', 'system_health'], { ...env, APP_MCP_TOKEN: TOKEN })).exitCode, 2);
});
test('URL restrictions, malformed credentials, option bounds, and TLS bypass are enforced', () => {
  const base = { MCP_URL: 'https://example.com/mcp', APP_MCP_TOKEN: TOKEN };
  for (const url of ['http://example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com/mcp#x', 'file:///etc/passwd']) {
    assert.throws(() => parseArgs(['list', '--url', url], base));
  }
  assert.throws(() => parseArgs(['list'], { ...base, APP_MCP_TOKEN: 'bad\nheader' }));
  assert.throws(() => parseArgs(['list'], { ...base, NODE_TLS_REJECT_UNAUTHORIZED: '0' }));
  assert.throws(() => parseArgs(['list', '--max-pages', '101'], base));
  assert.throws(() => parseArgs(['doctor', '--anonymous', '--require-auth', '--allow-tool', 'system_health'], base));
  assert.throws(() => parseArgs(['list', '--ready-path', '//other.example/path'], base));
  assert.throws(() => parseArgs(['list', '--unknown', 'x'], base));
  assert.equal(parseArgs(['list', '--anonymous'], { MCP_URL: 'http://[::1]:3000/mcp' }).token, null);
});
test('arguments file must be bounded JSON object, not array, malformed JSON, or directory', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-args-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'args.json');
  await writeFile(path, JSON.stringify({ title: '한국어 테스트', nested: { id: 'fixture' } }));
  assert.equal((await readArguments(path)).title, '한국어 테스트');
  for (const text of ['[]', '{', ' '.repeat(262145)]) {
    await writeFile(path, text); await assert.rejects(readArguments(path));
  }
  await assert.rejects(readArguments(dir));
  assert.deepEqual(await readArguments(null), {});
});

// Wire profile and complete happy path

test('doctor verifies liveness, readiness, discovery, catalog, safe call and negative auth', async t => {
  const f = await fixture(t);
  const out = await run([...doctorArgs, '--expect-server', 'fixture-api'], f.env);
  assert.equal(out.exitCode, 0, JSON.stringify(out.report));
  assert.equal(out.report.status, 'PASS'); assert.equal(out.report.checks.length, 6);
  assert.ok(out.report.checks.every(c => c.status === 'PASS'));
  assert.deepEqual(out.report.server, { name: 'fixture-api', version: '0.0.0-test' });
  assert.equal(f.seen.find(e => e.path === '/healthz').headers.authorization, undefined);
  assert.equal(f.seen.find(e => e.path === '/readyz').headers.authorization, `Bearer ${TOKEN}`);
  const posts = f.seen.filter(e => e.body);
  assert.deepEqual(posts.map(e => e.body.method), ['server/discover', 'tools/list', 'tools/call', 'tools/list']);
  const ids = new Set();
  for (const e of posts) {
    assert.equal(e.headers['mcp-protocol-version'], PROTOCOL);
    assert.equal(e.headers['mcp-method'], e.body.method);
    assert.match(e.headers.accept, /application\/json, text\/event-stream/);
    assert.equal(e.headers['mcp-session-id'], undefined);
    assert.equal(e.body.params._meta['io.modelcontextprotocol/protocolVersion'], PROTOCOL);
    assert.deepEqual(e.body.params._meta['io.modelcontextprotocol/clientCapabilities'], {});
    assert.equal(typeof e.body.params._meta['io.modelcontextprotocol/clientInfo'].name, 'string');
    assert.ok(!ids.has(e.body.id)); ids.add(e.body.id);
  }
  assert.equal(posts[2].headers['mcp-name'], 'system_health');
  assert.equal(posts.at(-1).headers.authorization, undefined);
  assert.ok(!JSON.stringify(out).includes(TOKEN));
});
test('doctor supports same-origin health prefixes and reports omitted auth test as SKIP', async t => {
  const f = await fixture(t);
  const out = await run(['doctor', '--allow-tool', 'system_health', '--health-path', '/prefix/healthz', '--ready-path', '/prefix/readyz'], f.env);
  assert.equal(out.exitCode, 0);
  assert.equal(out.report.checks.find(c => c.name === 'unauthenticated_rejected').status, 'SKIP');
});
test('JSON/SSE success including comment notifications, multiline events, and Unicode', async t => {
  const f = await fixture(t, { sse: true, tool: () => complete({ content: [{ type: 'text', text: '안녕하세요 🌐' }], structuredContent: { ok: true, title: '한국어' } }) });
  const out = await run(callArgs, f.env);
  assert.equal(out.exitCode, 0, JSON.stringify(out.report));
  assert.equal(out.report.result.structuredContent.title, '한국어');
});
test('tool listing collects bounded pages and does not call any tool', async t => {
  const f = await fixture(t, { catalog: params => complete(params.cursor ?
    { tools: [{ ...healthTool, name: 'read_second' }], ttlMs: 1, cacheScope: 'private' } :
    { tools: [healthTool], nextCursor: 'page-2', ttlMs: 1, cacheScope: 'private' }) });
  const out = await run(['list'], f.env);
  assert.equal(out.exitCode, 0); assert.equal(out.report.catalog.pages, 2);
  assert.deepEqual(out.report.catalog.tools.map(t => t.name), ['system_health', 'read_second']);
  assert.ok(!f.seen.some(e => e.body?.method === 'tools/call'));
});
test('anonymous mode must be explicit and supports a public fixture', async t => {
  const f = await fixture(t, { public: true });
  const out = await run(['list', '--anonymous'], { MCP_URL: f.url });
  assert.equal(out.exitCode, 0); assert.ok(f.seen.every(e => !e.headers.authorization));
});

// Failed and incomplete checks must not become success

test('401 failure is sanitized and never triggers automatic downgrade', async t => {
  const f = await fixture(t);
  const out = await run(['list'], { ...f.env, APP_MCP_TOKEN: 'wrong-fixture-token' });
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'HTTP_401'));
  assert.ok(!JSON.stringify(out).includes(TOKEN));
  assert.ok(!JSON.stringify(out).includes('wrong-fixture-token'));
  assert.deepEqual(f.seen.map(e => e.body.method), ['server/discover']);
});
test('public discovery fails --require-auth and a bare 401 fails challenge verification', async t => {
  for (const mode of [{ public: true, code: 'AUTH_NOT_ENFORCED' }, { noChallenge: true, code: 'AUTH_CHALLENGE' }]) {
    const f = await fixture(t, mode);
    const out = await run(doctorArgs, f.env);
    assert.equal(out.exitCode, 1); assert.ok(hasCode(out, mode.code));
  }
});
test('403 does not count as proof of authentication challenge', async t => {
  const f = await fixture(t, { authStatus: 403 });
  const out = await run(doctorArgs, f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'AUTH_NOT_ENFORCED'));
});
test('an expected server identity mismatch prevents tool calls', async t => {
  const f = await fixture(t);
  const out = await run([...callArgs, '--expect-server', 'different-server'], f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'SERVER_IDENTITY'));
  assert.ok(!f.seen.some(e => e.body?.method === 'tools/call'));
});
test('missing recommended server identity is a warning, not invented identity', async t => {
  const f = await fixture(t, { discovery: () => ({ ...discoverResult(), _meta: {} }) });
  const out = await run(['discover'], f.env);
  assert.equal(out.exitCode, 0); assert.equal(out.report.server, null);
  assert.match(out.report.warnings[0], /omitted/);
});
test('wrong response id, missing resultType, and missing cache metadata fail', async t => {
  const modes = [
    { wrongId: true, code: 'RPC_ID' },
    { discovery: () => { const r = discoverResult(); delete r.resultType; return r; }, code: 'RESULT_TYPE' },
    { catalog: () => complete({ tools: [healthTool] }), code: 'CACHE_METADATA' }
  ];
  for (const mode of modes) {
    const f = await fixture(t, mode); const out = await run(['list'], f.env);
    assert.equal(out.exitCode, 1); assert.ok(hasCode(out, mode.code), JSON.stringify(out.report));
  }
});
test('session headers on a modern result are rejected', async t => {
  const f = await fixture(t, { responseHeaders: { 'mcp-session-id': 'unexpected' } });
  const out = await run(['discover'], f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'SESSION_HEADER'));
});
test('unsupported protocol JSON-RPC errors are recognized even with HTTP 400', async t => {
  const f = await fixture(t, { intercept: (event, res) => {
    send(res, 400, { jsonrpc: '2.0', id: event.body.id, error: { code: -32022, message: `Do not print ${TOKEN}`, data: { supported: ['2025-11-25'] } } }); return true;
  } });
  const out = await run(['discover'], f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'PROTOCOL_VERSION'));
  assert.ok(!JSON.stringify(out).includes(TOKEN));
});
test('HTTP-200 JSON-RPC errors and HTML responses are not successful discoveries', async t => {
  for (const mode of ['rpc', 'html']) {
    const f = await fixture(t, { intercept: (event, res) => {
      if (mode === 'rpc') send(res, 200, { jsonrpc: '2.0', id: event.body.id, error: { code: -32603, message: TOKEN } });
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>login</html>'); }
      return true;
    } });
    const out = await run(['discover'], f.env);
    assert.equal(out.exitCode, 1); assert.ok(hasCode(out, mode === 'rpc' ? 'RPC_ERROR' : 'CONTENT_TYPE'));
  }
});
test('redirects are not followed and credentials are never sent to their destination', async t => {
  const f = await fixture(t, { intercept: (_, res) => { res.writeHead(307, { location: '/stolen' }); res.end(); return true; } });
  const out = await run(['discover'], f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'REDIRECT')); assert.equal(f.seen.length, 1);
});
test('response size cap and wall-clock timeout are enforced', async t => {
  const big = await fixture(t, { intercept: (_, res) => { send(res, 200, { padding: 'x'.repeat(4096) }); return true; } });
  const out = await run(['discover', '--max-bytes', '256'], big.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'BODY_LIMIT'));
  const slow = await fixture(t, { intercept: async (_, res) => { await new Promise(r => setTimeout(r, 250)); if (!res.destroyed) send(res, 200, {}); return true; } });
  const timeout = await run(['discover', '--timeout-ms', '100'], slow.env);
  assert.equal(timeout.exitCode, 1); assert.ok(hasCode(timeout, 'TIMEOUT'));
});
test('page limit, cursor cycle, and duplicate names are explicit failures', async t => {
  const modes = [
    { args: ['--max-pages', '1'], catalog: () => complete({ tools: [], nextCursor: 'more', ttlMs: 0, cacheScope: 'private' }), code: 'PAGE_LIMIT' },
    { args: [], catalog: () => complete({ tools: [], nextCursor: 'cycle', ttlMs: 0, cacheScope: 'private' }), code: 'CURSOR' },
    { args: [], catalog: () => complete({ tools: [healthTool, healthTool], ttlMs: 0, cacheScope: 'private' }), code: 'DUPLICATE_TOOL' }
  ];
  for (const mode of modes) {
    const f = await fixture(t, mode); const out = await run(['list', ...mode.args], f.env);
    assert.equal(out.exitCode, 1); assert.ok(hasCode(out, mode.code));
  }
});
test('HTTP 200 with tool isError or unhealthy structured output fails', async t => {
  for (const mode of ['isError', 'unhealthy']) {
    const f = await fixture(t, { tool: () => complete({ content: [{ type: 'text', text: TOKEN }], structuredContent: { ok: false }, ...(mode === 'isError' ? { isError: true } : {}) }) });
    const out = await run(doctorArgs, f.env);
    assert.equal(out.exitCode, 1); assert.ok(hasCode(out, mode === 'isError' ? 'TOOL_ERROR' : 'HEALTH_TOOL'));
    assert.ok(!JSON.stringify(out).includes(TOKEN));
  }
});
test('input_required is INCOMPLETE with exit 2, never successful health', async t => {
  const f = await fixture(t, { tool: () => ({ resultType: 'input_required', inputRequests: [], requestState: 'opaque-fixture' }) });
  const out = await run(doctorArgs, f.env);
  assert.equal(out.exitCode, 2); assert.equal(out.report.status, 'INCOMPLETE'); assert.ok(hasCode(out, 'INPUT_REQUIRED'));
});
test('unavailable allowlisted tool is not guessed or replaced', async t => {
  const f = await fixture(t, { catalog: () => complete({ tools: [{ ...healthTool, name: 'other_tool' }], ttlMs: 0, cacheScope: 'private' }) });
  const out = await run(callArgs, f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'TOOL_UNAVAILABLE'));
  assert.ok(!f.seen.some(e => e.body?.method === 'tools/call'));
});
test('incomplete SSE event is rejected instead of accepting partial JSON', async t => {
  const f = await fixture(t, { intercept: (e, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: e.body.id, result: discoverResult() })}`); return true;
  } });
  const out = await run(['discover'], f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'INCOMPLETE_STREAM'));
});
test('503 readiness remains failure even when MCP tool round trip succeeds', async t => {
  const f = await fixture(t, { readyStatus: 503 });
  const out = await run(doctorArgs, f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'HTTP_503'));
  assert.equal(out.report.checks.find(c => c.name === 'tool_call').status, 'PASS');
});

// Header annotations are transport metadata, not permission claims.

test('header encoding handles Unicode, surrounding whitespace and literal sentinel', () => {
  assert.equal(encodeHeader('fixture-123'), 'fixture-123');
  for (const text of ['한국어', ' leading', 'trailing ', '=?base64?already?=', 'line\nbreak']) {
    assert.equal(encodeHeader(text), `=?base64?${Buffer.from(text).toString('base64')}?=`);
  }
  assert.equal(encodeHeader('a\tb'), 'a\tb');
});
test('nested simple header annotations work; duplicates, arrays, compositions, numbers do not', () => {
  const schema = { type: 'object', properties: { context: { type: 'object', properties: {
    title: { type: 'string', 'x-mcp-header': 'title' },
    count: { type: 'integer', 'x-mcp-header': 'count' },
    enabled: { type: 'boolean', 'x-mcp-header': 'enabled' }
  } } } };
  assert.deepEqual(argumentHeaders(schema, { context: { title: '한글', count: 3, enabled: true } }), {
    'Mcp-Param-title': encodeHeader('한글'), 'Mcp-Param-count': '3', 'Mcp-Param-enabled': 'true'
  });
  assert.deepEqual(argumentHeaders(schema, {}), {});
  assert.throws(() => argumentHeaders(schema, { context: { count: 1.1 } }));
  assert.throws(() => argumentHeaders(schema, { context: { count: Number.MAX_SAFE_INTEGER + 1 } }));
  const bad = [
    { type: 'object', properties: { a: { type: 'number', 'x-mcp-header': 'a' } } },
    { type: 'object', properties: { a: { type: 'string', 'x-mcp-header': 'same' }, b: { type: 'boolean', 'x-mcp-header': 'SAME' } } },
    { type: 'object', properties: { a: { type: 'array', items: { type: 'string', 'x-mcp-header': 'a' } } } },
    { allOf: [{ properties: { a: { type: 'string', 'x-mcp-header': 'a' } } }] },
    { type: 'object', properties: { a: { type: 'string', 'x-mcp-header': 'bad header' } } }
  ];
  for (const s of bad) assert.throws(() => headerBindings(s));
});
test('malformed annotated tools are excluded and cannot be called', async t => {
  const f = await fixture(t, { catalog: () => complete({ ttlMs: 0, cacheScope: 'private', tools: [
    { ...healthTool, inputSchema: { type: 'object', properties: { bad: { type: 'number', 'x-mcp-header': 'Bad' } } } },
    { ...healthTool, name: 'valid_other' }
  ] }) });
  const listing = await run(['list'], f.env);
  assert.equal(listing.exitCode, 0); assert.equal(listing.report.catalog.rejectedTools.length, 1);
  assert.deepEqual(listing.report.catalog.tools.map(t => t.name), ['valid_other']);
  const out = await run(callArgs, f.env);
  assert.equal(out.exitCode, 1); assert.ok(hasCode(out, 'TOOL_UNAVAILABLE'));
});
test('Unicode annotated argument is actually transmitted as the encoded routing header', async t => {
  const schema = { type: 'object', properties: { fixture: { type: 'string', 'x-mcp-header': 'Fixture' } } };
  const f = await fixture(t, { catalog: () => complete({ tools: [{ ...healthTool, inputSchema: schema }], ttlMs: 0, cacheScope: 'private' }) });
  const dir = await mkdtemp(join(tmpdir(), 'mcp-unicode-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'args.json'); await writeFile(path, JSON.stringify({ fixture: '교육 자료' }));
  const out = await run([...callArgs, '--args-file', path], f.env);
  assert.equal(out.exitCode, 0);
  const call = f.seen.find(e => e.body?.method === 'tools/call');
  assert.equal(call.headers['mcp-param-fixture'], encodeHeader('교육 자료'));
  assert.equal(call.body.params.arguments.fixture, '교육 자료');
});

// Skill installation itself is independent from MCP attachment.

test('installer copies to each correct project directory and refuses overwrite', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-install-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [target, base] of [['claude', '.claude'], ['codex', '.agents'], ['pi', '.pi']]) {
    const out = await install(['--target', target, '--project', dir]);
    assert.equal(out.installed, join(dir, base, 'skills', 'stateless-mcp-builder'));
    assert.equal(out.serverConnected, false);
    assert.match(await readFile(join(out.installed, 'SKILL.md'), 'utf8'), /name: stateless-mcp-builder/);
    await assert.rejects(install(['--target', target, '--project', dir]), /already exists/);
  }
});
test('installer refuses symlinked ancestors and does not overwrite unrelated config', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-install-link-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const elsewhere = join(dir, 'elsewhere'); await mkdir(elsewhere);
  try { await symlink(elsewhere, join(dir, '.claude'), 'dir'); }
  catch (e) { if (process.platform === 'win32' && e.code === 'EPERM') { t.skip('Windows symlink privilege is unavailable.'); return; } throw e; }
  await assert.rejects(install(['--target', 'claude', '--project', dir]), /symlinks/);
});


test('real CLI process emits JSON with the correct success and usage exit codes', async t => {
  const f = await fixture(t);
  const cli = fileURLToPath(new URL('../scripts/mcp-check.mjs', import.meta.url));
  const invoke = (args, env) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env, NODE_TLS_REJECT_UNAUTHORIZED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [], err = [];
    child.stdout.on('data', b => chunks.push(b)); child.stderr.on('data', b => err.push(b));
    child.on('error', reject);
    child.on('close', code => resolve({ code, text: Buffer.concat(chunks).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
  });
  const good = await invoke(doctorArgs, f.env);
  assert.equal(good.code, 0); assert.equal(JSON.parse(good.text).status, 'PASS'); assert.equal(good.stderr, '');
  const bad = await invoke(['list'], { ...f.env, APP_MCP_TOKEN: '' });
  assert.equal(bad.code, 2); assert.equal(JSON.parse(bad.text).diagnostic.code, 'USAGE');
});

test('a named pipe is rejected without waiting for a writer (POSIX)', async t => {
  if (process.platform === 'win32') { t.skip('POSIX named-pipe fixture is not available on Windows.'); return; }
  const dir = await mkdtemp(join(tmpdir(), 'mcp-fifo-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'arguments.pipe');
  const code = await new Promise((resolve, reject) => {
    const child = spawn('mkfifo', [path]); child.on('error', reject); child.on('close', resolve);
  });
  assert.equal(code, 0);
  await assert.rejects(readArguments(path), /regular JSON file/);
});
