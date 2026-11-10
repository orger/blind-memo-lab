import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(['.html', '.js', '.css', '.webmanifest', '.svg', '.png', '.webp', '.woff', '.woff2']);

async function publicFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Public assets must not be symbolic links: ${relative}`);
    if (entry.isDirectory()) files.push(...await publicFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && allowed.has(path.extname(entry.name))) files.push(relative);
  }
  return files.sort();
}

export async function buildBlindWeb({ outputDirectory = path.join(root, 'dist', 'blind-web') } = {}) {
  const files = new Map();
  const source = path.join(root, 'app', 'blind');
  for (const name of await publicFiles(source)) files.set(name, await readFile(path.join(source, name)));
  if (!files.has('index.html') || !files.has('sw.js')) throw new Error('Blind Memo Lab interface or offline worker is missing.');
  for (const name of ['LICENSE', 'NOTICE']) files.set(name, await readFile(path.join(root, name)));
  files.set('GUIDE.md', await readFile(path.join(root, 'docs', 'BLIND-MEMO-GUIDE.md')));
  files.set('BLIND-MEMO-DEPLOY.md', await readFile(path.join(root, 'docs', 'BLIND-MEMO-DEPLOY.md')));
  files.set('CNAME', Buffer.from('blind.orger.org\n'));
  files.set('.nojekyll', Buffer.from(''));
  const hash = createHash('sha256');
  for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update('\0').update(data).update('\0');
  const version = hash.digest('hex').slice(0, 20);
  const precache = ['./', ...[...files.keys()].filter(name => !['sw.js', 'CNAME', '.nojekyll'].includes(name)).sort().map(name => `./${name}`)];
  const worker = files.get('sw.js').toString()
    .replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`)
    .replace(/const PRECACHE = \[[\s\S]*?\n\];/, `const PRECACHE = ${JSON.stringify(precache, null, 2)};`);
  if (!worker.includes(`const CACHE_VERSION = '${version}';`) || !worker.includes('GUIDE.md')) {
    throw new Error('Offline worker must expose CACHE_VERSION and multiline PRECACHE constants.');
  }
  files.set('sw.js', Buffer.from(worker));
  await rm(outputDirectory, { recursive: true, force: true });
  for (const [name, content] of files) {
    const destination = path.join(outputDirectory, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  return { outputDirectory, version, files: [...files.keys()].sort(), precache };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildBlindWeb(process.argv[2] ? { outputDirectory: path.resolve(process.argv[2]) } : {});
  console.log(`Built ${result.files.length} Blind Memo Lab public files in ${result.outputDirectory}`);
  console.log(`Offline version: ${result.version}`);
}
