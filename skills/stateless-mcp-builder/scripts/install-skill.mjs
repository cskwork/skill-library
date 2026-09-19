#!/usr/bin/env node
/** Project-local skill installer. Copies files; never connects or edits MCP config. */
import { cp, lstat, mkdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = 'stateless-mcp-builder';
const TARGETS = { claude: '.claude', codex: '.agents', pi: '.pi' };
const HELP = `Usage: node install-skill.mjs --target claude|codex|pi [--project DIR]
Copies the complete skill into the selected project's skill directory.
Refuses overwrite and symlinked destination ancestors. Does not install packages,
edit MCP configuration, store credentials, or connect a server.\n`;
const inside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};
export async function install(argv) {
  if (argv.includes('--help')) return { help: HELP };
  let target, project = process.cwd();
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[++i];
    if (!['--target', '--project'].includes(flag) || !value || seen.has(flag)) throw new Error('Use --target and optional --project; see --help.');
    seen.add(flag);
    if (flag === '--target') target = value; else project = value;
  }
  if (!Object.hasOwn(TARGETS, target)) throw new Error('Select claude, codex, or pi with --target.');
  const source = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const root = await realpath(project);
  if (!(await lstat(root)).isDirectory()) throw new Error('Project path must be an existing directory.');
  const destination = join(root, TARGETS[target], 'skills', SKILL);
  if (inside(destination, source)) throw new Error('Destination must not be inside the source skill directory.');
  for (const path of [join(root, TARGETS[target]), join(root, TARGETS[target], 'skills'), destination]) {
    try {
      const stat = await lstat(path);
      if (path === destination) throw new Error('Destination already exists; review and update it manually.');
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Destination ancestors must be ordinary directories, not symlinks or files.');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  return { installed: destination, target, serverConnected: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await install(process.argv.slice(2));
    process.stdout.write(result.help || `${JSON.stringify(result, null, 2)}\n`);
  } catch (e) {
    const safe = e.code ? 'Filesystem operation failed; check project access and existing paths.' : e.message;
    process.stderr.write(`${safe}\n`); process.exitCode = 2;
  }
}
