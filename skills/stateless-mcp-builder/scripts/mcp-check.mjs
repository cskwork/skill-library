#!/usr/bin/env node
/**
 * Bounded MCP 2026-07-28 HTTP diagnostic client, MIT.
 * Not an SDK, OAuth client, schema validator, or legacy bridge.
 * No dependency installation, redirects, retries, or implicit tool execution.
 */
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const PROTOCOL = '2026-07-28';
const VERSION = '1.0.0';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class CheckError extends Error {
  constructor(code, message, { exitCode = 1, httpStatus, rpcCode } = {}) {
    super(message);
    this.name = 'CheckError';
    this.code = code;
    this.exitCode = exitCode;
    if (Number.isInteger(httpStatus)) this.httpStatus = httpStatus;
    if (Number.isInteger(rpcCode)) this.rpcCode = rpcCode;
  }
}
const usage = (message) => new CheckError('USAGE', message, { exitCode: 2 });
function fail(code, message, extra) { throw new CheckError(code, message, extra); }
export function diagnostic(error) {
  // Never echo exception stacks, URLs, request headers, or server error messages.
  if (!(error instanceof CheckError)) return { code: 'INTERNAL', message: 'Unexpected local failure; inspect the reviewed utility.' };
  const d = { code: error.code, message: error.message };
  if (error.httpStatus !== undefined) d.httpStatus = error.httpStatus;
  if (error.rpcCode !== undefined) d.rpcCode = error.rpcCode;
  return d;
}

export const HELP = `Usage: node mcp-check.mjs <doctor|discover|list|call> [options]
  --url URL              MCP endpoint; default MCP_URL. HTTPS, or loopback HTTP.
  --token-env NAME        Read bearer credential from NAME (APP_MCP_TOKEN default).
  --anonymous             Deliberately omit authentication for a controlled fixture.
  --tool NAME             Tool to call; doctor defaults to system_health.
  --allow-tool NAME        Explicit approved name; repeat for multiple allowed names.
  --args-file PATH         JSON object arguments for call only (maximum 256 KiB).
  --require-auth          Doctor: unauthenticated tools/list must challenge with 401.
  --health-path PATH      Doctor liveness path, default /healthz (no bearer token).
  --ready-path PATH       Doctor readiness path, default /readyz (with token).
  --expect-server NAME    Require discovery serverInfo.name to match this name.
  --timeout-ms N          Per-request deadline, 100..60000; default 10000.
  --max-bytes N           Per-response limit, 256..8388608; default 1048576.
  --max-pages N           tools/list page cap, 1..100; default 20.
  --help                 Show this help without connecting.

Exit: 0 selected checks pass, 1 failed, 2 invalid invocation or incomplete flow.
Modern HTTP only. No automatic OAuth, downgrade, retry, stdio, or MRTR completion.
URL userinfo/query/fragment, redirects and TLS-verification bypass are rejected.
Tool allowlisting is a local safeguard, NOT an authorization boundary: enforce
permissions and approved writes at the server. Returned call data is untrusted.
`;

export function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw usage('Set a valid --url or MCP_URL.'); }
  if (u.username || u.password || u.search || u.hash) throw usage('The endpoint must not contain userinfo, query parameters, or a fragment.');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw usage('Use HTTPS; unencrypted HTTP is allowed only on loopback.');
  return u.href;
}
function numeric(value, lo, hi, flag) {
  if (!/^\d+$/.test(value)) throw usage(`${flag} requires an integer.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < lo || n > hi) throw usage(`${flag} is outside the permitted range.`);
  return n;
}
function probePath(path) {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\?#\x00-\x20]/.test(path)) throw usage('Health paths must be absolute paths on the MCP origin, without query or fragment.');
  return path;
}
function toolName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 128 || /[\x00-\x1f\x7f]/.test(name)) throw usage('Tool names must be nonempty, bounded strings without control characters.');
  return name;
}
export function parseArgs(argv, env = process.env) {
  if (argv.includes('--help')) return { help: true };
  const [command, ...rest] = argv;
  if (!['doctor', 'discover', 'list', 'call'].includes(command)) throw usage('Choose doctor, discover, list, or call; use --help for options.');
  const o = { command, tokenEnv: 'APP_MCP_TOKEN', anonymous: false, requireAuth: false,
    healthPath: '/healthz', readyPath: '/readyz', timeoutMs: 10000, maxBytes: 1048576,
    maxPages: 20, allowTools: [], argsFile: null, expectedServer: null, tool: null };
  const map = { '--url': 'url', '--token-env': 'tokenEnv', '--tool': 'tool', '--args-file': 'argsFile',
    '--health-path': 'healthPath', '--ready-path': 'readyPath', '--expect-server': 'expectedServer' };
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (seen.has(flag) && flag !== '--allow-tool') throw usage('Do not repeat single-valued options.');
    seen.add(flag);
    if (flag === '--anonymous') { o.anonymous = true; continue; }
    if (flag === '--require-auth') { o.requireAuth = true; continue; }
    if (!own(map, flag) && !['--allow-tool', '--timeout-ms', '--max-bytes', '--max-pages'].includes(flag)) throw usage('Unknown option; use --help.');
    const v = rest[++i];
    if (v === undefined || v.startsWith('--')) throw usage('An option is missing its value.');
    if (flag === '--allow-tool') o.allowTools.push(toolName(v));
    else if (flag === '--timeout-ms') o.timeoutMs = numeric(v, 100, 60000, flag);
    else if (flag === '--max-bytes') o.maxBytes = numeric(v, 256, 8388608, flag);
    else if (flag === '--max-pages') o.maxPages = numeric(v, 1, 100, flag);
    else o[map[flag]] = v;
  }
  o.url = validateUrl(o.url || env.MCP_URL);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(o.tokenEnv)) throw usage('Use an environment variable name for --token-env, never a token value.');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw usage('TLS verification bypass must be disabled before using this utility.');
  o.token = o.anonymous ? null : env[o.tokenEnv];
  if (!o.anonymous && (typeof o.token !== 'string' || !o.token || !/^[\x21-\x7e]+$/.test(o.token))) throw usage('The bearer credential is missing or malformed in the selected environment variable.');
  if (o.requireAuth && (o.anonymous || command !== 'doctor')) throw usage('--require-auth needs doctor with an authenticated credential.');
  if (o.argsFile && command !== 'call') throw usage('--args-file is supported only by call; doctor uses empty health arguments.');
  o.healthPath = probePath(o.healthPath);
  o.readyPath = probePath(o.readyPath);
  if (command === 'doctor' && !o.tool) o.tool = 'system_health';
  if (['call', 'doctor'].includes(command)) {
    toolName(o.tool);
    if (!o.allowTools.includes(o.tool)) throw usage('Explicitly approve the selected tool with a matching --allow-tool.');
  }
  return o;
}

/** Read a bounded regular file; never read stdin, a device, or a FIFO. */
export async function readArguments(path) {
  if (!path) return {};
  let file;
  try {
    file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 262144) throw usage('Arguments must be a regular JSON file of at most 256 KiB.');
    const buffer = Buffer.alloc(262145);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await file.read(buffer, count, buffer.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > 262144) throw usage('Arguments exceed 256 KiB.');
    let data;
    try { data = JSON.parse(buffer.subarray(0, count).toString('utf8')); } catch { throw usage('Arguments file must contain valid JSON.'); }
    if (!object(data)) throw usage('Arguments must be a JSON object.');
    return data;
  } catch (e) {
    if (e instanceof CheckError) throw e;
    throw usage('Cannot open the arguments file.');
  } finally { await file?.close(); }
}

/** Standard transport encoding; never place raw Unicode/control bytes in headers. */
export function encodeHeader(value) {
  const s = String(value);
  if (!/^[\t\x20-\x7e]*$/.test(s) || /^[ \t]|[ \t]$/.test(s) || (s.startsWith('=?base64?') && s.endsWith('?='))) {
    return `=?base64?${Buffer.from(s, 'utf8').toString('base64')}?=`;
  }
  return s;
}

/** Only simple property paths are reachable. No arrays, $ref or compositions. */
export function headerBindings(schema) {
  const bindings = [], names = new Set();
  let nodes = 0;
  function walk(node, path, reachable, depth) {
    if (++nodes > 4096 || depth > 32) fail('HEADER_SCHEMA', 'Tool schema exceeds diagnostic traversal limits.');
    if (!object(node) && !Array.isArray(node)) return;
    if (object(node) && own(node, 'x-mcp-header')) {
      const name = node['x-mcp-header'];
      if (!reachable || !path.length || typeof name !== 'string' || name.length > 128 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) fail('HEADER_SCHEMA', 'Tool has a malformed or unreachable x-mcp-header annotation.');
      if (!['string', 'integer', 'boolean'].includes(node.type) || names.has(name.toLowerCase())) fail('HEADER_SCHEMA', 'Header annotations require unique names and simple scalar types.');
      names.add(name.toLowerCase());
      bindings.push({ path, name: `Mcp-Param-${name}`, type: node.type });
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child, path, false, depth + 1);
    } else {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'properties' && object(child)) {
          for (const [prop, definition] of Object.entries(child)) walk(definition, [...path, prop], reachable, depth + 1);
        } else if (object(child) || Array.isArray(child)) walk(child, path, false, depth + 1);
      }
    }
  }
  walk(schema, [], true, 0);
  return bindings;
}
export function argumentHeaders(schema, args) {
  const headers = {};
  for (const binding of headerBindings(schema)) {
    let value = args, exists = true;
    for (const part of binding.path) {
      if (!object(value) || !own(value, part)) { exists = false; break; }
      value = value[part];
    }
    if (!exists) continue;
    const valid = binding.type === 'integer' ? Number.isSafeInteger(value) : typeof value === binding.type;
    if (!valid) fail('HEADER_ARGUMENT', 'An annotated argument has the wrong type or is not a safe integer.');
    headers[binding.name] = encodeHeader(value);
  }
  return headers;
}

async function readBytes(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) fail('BODY_LIMIT', 'Response exceeded the configured byte limit.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function parseJson(text) {
  try { return JSON.parse(text); } catch { fail('INVALID_JSON', 'Expected a valid JSON response.'); }
}
function rpcEnvelope(value, id, allowNotification = false) {
  if (!object(value) || value.jsonrpc !== '2.0') fail('RPC_ENVELOPE', 'Malformed JSON-RPC envelope.');
  if (allowNotification && !own(value, 'id') && typeof value.method === 'string' && !own(value, 'result') && !own(value, 'error')) return null;
  if (typeof value.method === 'string') fail('SERVER_REQUEST', 'This restricted client does not handle server-initiated requests.');
  if (value.id !== id) fail('RPC_ID', 'Response request identifier does not match.');
  if (own(value, 'result') === own(value, 'error')) fail('RPC_ENVELOPE', 'Expected exactly one JSON-RPC result or error.');
  if (own(value, 'error')) {
    const code = object(value.error) && Number.isInteger(value.error.code) ? value.error.code : undefined;
    fail(code === -32022 ? 'PROTOCOL_VERSION' : 'RPC_ERROR', 'Server returned a JSON-RPC error; inspect sanitized server logs.', { rpcCode: code });
  }
  const r = value.result;
  if (!object(r)) fail('RESULT_SHAPE', 'Expected an MCP result object.');
  if (r.resultType === 'input_required') fail('INPUT_REQUIRED', 'Additional interaction is required; this client does not complete MRTR.', { exitCode: 2 });
  if (r.resultType !== 'complete') fail('RESULT_TYPE', 'Modern results require resultType complete; no legacy downgrade was attempted.');
  return r;
}

/** Incremental SSE parser supporting comments, multiline data and split CRLF. */
async function readSse(response, id, maxBytes) {
  if (!response.body) fail('EMPTY_STREAM', 'MCP response stream is empty.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, buffer = '', data = [], found;
  function line(text) {
    if (text === '') {
      if (data.length) {
        const value = rpcEnvelope(parseJson(data.join('\n')), id, true);
        data = [];
        if (value !== null) found = value;
      }
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
  }
  function consume(final = false) {
    while (true) {
      const match = /[\r\n]/.exec(buffer);
      if (!match) break;
      const index = match.index, char = buffer[index];
      if (!final && char === '\r' && index === buffer.length - 1) break;
      const width = char === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
      const text = buffer.slice(0, index);
      buffer = buffer.slice(index + width);
      line(text);
      if (found !== undefined) return;
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode(); consume(true);
        // A last event without an empty-line delimiter is incomplete, not success.
        if (found !== undefined) return found;
        fail('INCOMPLETE_STREAM', 'Stream ended before a complete matching response.');
      }
      size += value.byteLength;
      if (size > maxBytes) fail('BODY_LIMIT', 'Response exceeded the configured byte limit.');
      buffer += decoder.decode(value, { stream: true });
      consume();
      if (found !== undefined) return found;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function request(options, { url = options.url, method = 'POST', headers = {}, body, authenticated = true }, consume) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let response;
  try {
    const h = { ...headers };
    if (authenticated && options.token) h.Authorization = `Bearer ${options.token}`;
    response = await fetch(url, { method, headers: h, body, redirect: 'manual', signal: controller.signal });
    if (response.status >= 300 && response.status < 400) fail('REDIRECT', 'Redirects are not followed; configure the final authorized endpoint.', { httpStatus: response.status });
    return await consume(response);
  } catch (e) {
    if (e instanceof CheckError) throw e;
    if (controller.signal.aborted) fail('TIMEOUT', 'Request exceeded the configured deadline.');
    fail('NETWORK', 'Network or TLS request failed; inspect endpoint reachability and trusted certificates.');
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
async function checkHttp(response, options) {
  if (response.ok) return;
  let rpcCode;
  const text = await readBytes(response, options.maxBytes);
  try {
    const v = JSON.parse(text);
    if (object(v) && object(v.error) && Number.isInteger(v.error.code)) rpcCode = v.error.code;
  } catch { /* No upstream text is included in diagnostics. */ }
  const code = rpcCode === -32022 ? 'PROTOCOL_VERSION' : `HTTP_${response.status}`;
  fail(code, 'HTTP request was rejected; no redirect, authentication bypass, or protocol downgrade was attempted.', { httpStatus: response.status, rpcCode });
}
export async function rpc(options, method, params = {}, extraHeaders = {}) {
  const id = randomUUID();
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': PROTOCOL,
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'stateless-mcp-check', version: VERSION }
    }
  } });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL, 'Mcp-Method': method, ...extraHeaders };
  if (method === 'tools/call') headers['Mcp-Name'] = encodeHeader(params.name);
  return request(options, { body, headers }, async (response) => {
    await checkHttp(response, options);
    if (response.headers.has('mcp-session-id')) fail('SESSION_HEADER', 'Modern endpoint returned a removed protocol-session header.');
    const ct = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct === 'text/event-stream') return readSse(response, id, options.maxBytes);
    if (ct !== 'application/json') fail('CONTENT_TYPE', 'Expected application/json or text/event-stream from the MCP endpoint.');
    return rpcEnvelope(parseJson(await readBytes(response, options.maxBytes)), id);
  });
}
function cacheMetadata(result) {
  if (!Number.isSafeInteger(result.ttlMs) || result.ttlMs < 0 || !['private', 'public'].includes(result.cacheScope)) fail('CACHE_METADATA', 'Catalog result requires bounded nonnegative ttlMs and public/private cacheScope.');
}
export async function discover(options) {
  const r = await rpc(options, 'server/discover');
  if (!Array.isArray(r.supportedVersions) || !r.supportedVersions.every(v => typeof v === 'string') || !r.supportedVersions.includes(PROTOCOL)) fail('PROTOCOL_VERSION', 'Discovery does not advertise the selected modern protocol version.');
  if (!object(r.capabilities) || !object(r.capabilities.tools)) fail('TOOLS_CAPABILITY', 'The endpoint does not advertise a tools capability.');
  const info = r._meta?.['io.modelcontextprotocol/serverInfo'];
  if (options.expectedServer && (!object(info) || info.name !== options.expectedServer)) fail('SERVER_IDENTITY', 'Discovered server identity does not match the expected name.');
  return r;
}
export async function listTools(options) {
  const tools = [], rejectedTools = [], seenNames = new Set(), cursors = new Set();
  let cursor;
  for (let page = 1; page <= options.maxPages; page++) {
    const result = await rpc(options, 'tools/list', cursor === undefined ? {} : { cursor });
    cacheMetadata(result);
    if (!Array.isArray(result.tools)) fail('TOOLS_SHAPE', 'Expected a tools array.');
    for (const t of result.tools) {
      if (!object(t) || typeof t.name !== 'string' || !t.name.length || t.name.length > 128 || /[\x00-\x1f\x7f]/.test(t.name) || !object(t.inputSchema)) fail('TOOL_SCHEMA', 'Catalog contains a malformed tool name or input schema.');
      if (seenNames.has(t.name)) fail('DUPLICATE_TOOL', 'Catalog contains a duplicate tool name.');
      seenNames.add(t.name);
      try { headerBindings(t.inputSchema); tools.push(t); }
      catch (e) {
        if (!(e instanceof CheckError) || e.code !== 'HEADER_SCHEMA') throw e;
        rejectedTools.push({ name: t.name, code: e.code });
      }
    }
    if (result.nextCursor === undefined) return { tools, rejectedTools, pages: page };
    if (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor.length > 4096 || cursors.has(result.nextCursor)) fail('CURSOR', 'Catalog returned an invalid or repeated pagination cursor.');
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  fail('PAGE_LIMIT', 'Catalog exceeded the configured page limit.');
}
export async function callTool(options, catalog, args = {}) {
  if (!options.allowTools.includes(options.tool)) throw usage('Selected tool is not explicitly allowlisted.');
  const tool = catalog.tools.find(t => t.name === options.tool);
  if (!tool) fail('TOOL_UNAVAILABLE', 'The selected tool was not available in the validated catalog.');
  const result = await rpc(options, 'tools/call', { name: tool.name, arguments: args }, argumentHeaders(tool.inputSchema, args));
  if (result.isError === true) fail('TOOL_ERROR', 'The tool reported failure even though the transport succeeded.');
  if (result.isError !== undefined && typeof result.isError !== 'boolean') fail('TOOL_RESULT', 'Tool isError must be a boolean.');
  if (!Array.isArray(result.content)) fail('TOOL_RESULT', 'Tool result requires a content array.');
  return result;
}
async function health(options, path, expectedStatus, authenticated) {
  const url = new URL(path, options.url);
  if (url.origin !== new URL(options.url).origin) throw usage('Health checks must stay on the MCP origin.');
  return request(options, { url: url.href, method: 'GET', authenticated, headers: { Accept: 'application/json' } }, async response => {
    await checkHttp(response, options);
    const ct = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') fail('HEALTH_CONTENT_TYPE', 'The conventional health route must return JSON.');
    const value = parseJson(await readBytes(response, options.maxBytes));
    if (!object(value) || value.status !== expectedStatus) fail('HEALTH_STATUS', 'The conventional health status did not match the project contract.');
    return { status: expectedStatus };
  });
}
async function authNegative(options) {
  // No write or tools/call occurs here. No secrets are sent on this request.
  const id = randomUUID();
  const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/list', params: { _meta: {
    'io.modelcontextprotocol/protocolVersion': PROTOCOL,
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': { name: 'stateless-mcp-check', version: VERSION }
  } } });
  return request(options, { authenticated: false, body, headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL, 'Mcp-Method': 'tools/list'
  } }, async response => {
    if (response.status !== 401) fail('AUTH_NOT_ENFORCED', 'Unauthenticated discovery did not return the required 401 challenge.', { httpStatus: response.status });
    if (!/\bBearer\b/i.test(response.headers.get('www-authenticate') || '')) fail('AUTH_CHALLENGE', '401 response lacks a Bearer authentication challenge.', { httpStatus: 401 });
    return { httpStatus: 401, bearerChallenge: true };
  });
}
function identity(discovery) {
  const info = discovery?._meta?.['io.modelcontextprotocol/serverInfo'];
  if (!object(info)) return null;
  return { name: typeof info.name === 'string' ? info.name : null, version: typeof info.version === 'string' ? info.version : null };
}
export async function execute(options) {
  if (options.help) return { exitCode: 0, help: HELP };
  const started = Date.now();
  const report = { utility: 'stateless-mcp-check', version: VERSION, protocol: PROTOCOL,
    command: options.command, checkedAt: new Date().toISOString(), checks: [] };
  const codes = [];
  async function check(name, operation) {
    const start = Date.now();
    try {
      const value = await operation();
      report.checks.push({ name, status: 'PASS', durationMs: Date.now() - start });
      return value;
    } catch (e) {
      report.checks.push({ name, status: e instanceof CheckError && e.exitCode === 2 ? 'INCOMPLETE' : 'FAIL', durationMs: Date.now() - start, diagnostic: diagnostic(e) });
      codes.push(e instanceof CheckError ? e.exitCode : 1);
      return undefined;
    }
  }
  function skip(name, reason) { report.checks.push({ name, status: 'SKIP', reason }); }
  if (options.command === 'doctor') {
    await check('liveness', () => health(options, options.healthPath, 'ok', false));
    await check('readiness', () => health(options, options.readyPath, 'ready', true));
  }
  // Validate the local argument file before any tool call. Only CLI commands with
  // an explicit name and allowlist can reach execution.
  let args = {};
  if (options.command === 'call') args = await check('arguments', () => readArguments(options.argsFile));
  const discovery = await check('discovery', () => discover(options));
  report.server = identity(discovery);
  if (discovery && !report.server) report.warnings = ['The server omitted recommended serverInfo; identity was not verified.'];
  if (options.command === 'discover') report.discovery = discovery;
  let catalog;
  if (options.command !== 'discover' && discovery) catalog = await check('tool_catalog', () => listTools(options));
  else if (options.command !== 'discover') skip('tool_catalog', 'Discovery did not pass.');
  if (catalog) {
    report.catalog = options.command === 'list' ? catalog : { toolNames: catalog.tools.map(t => t.name), rejectedTools: catalog.rejectedTools, pages: catalog.pages };
    if (catalog.rejectedTools.length) report.warnings = [...(report.warnings || []), 'Malformed header-annotated tools were excluded; inspect rejectedTools.'];
  }
  if (['call', 'doctor'].includes(options.command)) {
    if (catalog && args !== undefined) {
      const result = await check('tool_call', async () => {
        const r = await callTool(options, catalog, args);
        if (options.command === 'doctor' && (!object(r.structuredContent) || r.structuredContent.ok !== true)) fail('HEALTH_TOOL', 'The approved health tool must return structuredContent.ok true.');
        return r;
      });
      if (result) report.result = options.command === 'call' ? result : { tool: options.tool, ok: true };
    } else skip('tool_call', 'A required discovery, catalog, or argument check did not pass.');
  }
  if (options.command === 'doctor') {
    if (options.requireAuth) await check('unauthenticated_rejected', () => authNegative(options));
    else skip('unauthenticated_rejected', '--require-auth was not selected; authentication rejection is unverified.');
  }
  const exitCode = codes.includes(1) ? 1 : codes.includes(2) ? 2 : 0;
  report.status = exitCode === 0 ? 'PASS' : exitCode === 2 ? 'INCOMPLETE' : 'FAIL';
  report.durationMs = Date.now() - started;
  report.scope = 'Selected CLI checks only; no real harness, OAuth flow, full schema validation, or SDK conformance claim.';
  return { exitCode, report };
}
export async function run(argv, env = process.env) {
  try { return await execute(parseArgs(argv, env)); }
  catch (e) { return { exitCode: e instanceof CheckError ? e.exitCode : 1, report: { status: 'FAIL', diagnostic: diagnostic(e) } }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await run(process.argv.slice(2));
  process.stdout.write(outcome.help || `${JSON.stringify(outcome.report, null, 2)}\n`);
  process.exitCode = outcome.exitCode;
}
