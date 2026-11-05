// Downloads every Polyfork model and helper module the game uses.
// Files land in public/assets/polyfork (GLBs) and src/vendor/polyfork (ES modules).
// Already-downloaded files are skipped; pass --force to refresh them.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from '../src/world/models.js';

const ALL_MODEL_IDS = [...new Set(Object.values(MODELS).map((m) => m.id))];
const VENDOR_MODULES = ['stage'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://polyfork.dev/cdn/';
const force = process.argv.includes('--force');

const exists = (p) => access(p).then(() => true, () => false);

async function download(url, dest) {
  if (!force && (await exists(dest))) return 'skip';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return 'ok';
}

const jobs = [
  ...ALL_MODEL_IDS.map((id) => [`${CDN}${id}.glb`, join(ROOT, 'public/assets/polyfork', `${id}.glb`)]),
  ...VENDOR_MODULES.map((id) => [`${CDN}${id}.mjs`, join(ROOT, 'src/vendor/polyfork', `${id}.mjs`)]),
];

let failed = 0;
for (let i = 0; i < jobs.length; i += 6) {
  const batch = jobs.slice(i, i + 6);
  const results = await Promise.allSettled(batch.map(([url, dest]) => download(url, dest)));
  results.forEach((r, k) => {
    const name = batch[k][0].replace(CDN, '');
    if (r.status === 'fulfilled') console.log(`${r.value.padEnd(4)} ${name}`);
    else { failed++; console.error(`FAIL ${name}: ${r.reason.message}`); }
  });
}
if (failed) { console.error(`${failed} download(s) failed`); process.exit(1); }
