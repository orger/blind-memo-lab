import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBlindWeb } from '../scripts/build-blind-web.mjs';

test('standalone Blind Memo Lab release is complete, deterministic and excludes source attachments and saved user data', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'blind-memo-release-'));
  try {
    const outputDirectory = path.join(temporary, 'web');
    const result = await buildBlindWeb({ outputDirectory });
    const second = await buildBlindWeb({ outputDirectory });
    assert.equal(result.version, second.version);
    for (const required of ['index.html', 'app.js', 'styles.css', 'data.js', 'cube.js', 'cube-view.js', 'repetition.js', 'sw.js', 'manifest.webmanifest', 'LICENSE', 'NOTICE', 'GUIDE.md']) {
      assert.ok(result.files.includes(required), `${required} is packaged`);
    }
    assert.ok(!result.files.some(name => /\.xlsx?$|\.pdf$|backup|\.previous\.|data\.json|(^|\/)(tmp|tests|native)\//i.test(name)));
    for (const name of result.files.filter(name => !['sw.js', 'CNAME', '.nojekyll'].includes(name))) {
      assert.ok(result.precache.includes(`./${name}`), `${name} is cached before an offline visit`);
      await readFile(path.join(outputDirectory, name));
    }
    for (const name of result.files.filter(name => name.endsWith('.js'))) {
      const source = await readFile(path.join(outputDirectory, name), 'utf8');
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.\/[^'"]+)['"]/g)) {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
        assert.ok(result.files.includes(dependency), `${name} dependency ${dependency} is published`);
      }
    }
    const worker = await readFile(path.join(outputDirectory, 'sw.js'), 'utf8');
    assert.ok(worker.includes(`const CACHE_VERSION = '${result.version}';`));
    assert.ok(worker.includes('GUIDE.md'));
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) await readFile(path.join(outputDirectory, icon.src));
    assert.equal((await readFile(path.join(outputDirectory,'CNAME'),'utf8')).trim(),'blind.orger.org');
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
