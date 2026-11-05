import { defineConfig } from 'vite';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Polyfork's licence lets a game *contain* its models, but hosting the files
// on our own server, where anyone can download them, counts as
// redistribution. So a production build loads the models from Polyfork's
// public CDN (CORS-open, free low-poly assets) and does not copy them into
// dist. Set VITE_SELF_HOST_MODELS=1 only with Polyfork's written OK.
const selfHost = process.env.VITE_SELF_HOST_MODELS === '1';

// three (MIT), Rapier (Apache-2.0), N8AO and postprocessing ask for their
// notice in every copy, and Jua (OFL) for its licence next to the font. The
// bundle strips comments, so the build ships one text file with every
// production dependency's licence, read from node_modules (the credits and
// the README point at it).
const LICENCE_FILE = /^(licen[cs]e|copying|ofl)([.-].*)?$/i;
function thirdPartyLicences() {
  const header = `Secret Cave (비밀 동굴): third-party notices
https://yorkie-labs.github.io/secret-cave/

The game's own code, music and sound effects are original (the music and
sound effects are made in the browser with WebAudio). The code is not
licensed for reuse.

3D models: Polyfork (https://polyfork.dev). The models are NOT included in
this build. The game loads them at runtime from Polyfork's CDN, under
Polyfork's own terms.

Below: every production dependency bundled into this build, with its
licence text as shipped in its npm package.
`;
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle() {
      const deps = Object.keys(JSON.parse(readFileSync(resolve('package.json'), 'utf8')).dependencies ?? {});
      const parts = deps.map((name) => {
        const dir = resolve('node_modules', name);
        const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
        const files = readdirSync(dir).filter((f) => LICENCE_FILE.test(f)).sort();
        const texts = files.map((f) => readFileSync(resolve(dir, f), 'utf8').trim());
        const body = texts.length
          ? texts.join('\n\n')
          : `(This package ships no licence file. Its package.json declares: ${pkg.license ?? 'no licence'}.)`;
        return `${'='.repeat(78)}\n${name} ${pkg.version}\nLicense: ${pkg.license ?? 'unknown'}\n`
          + `${pkg.homepage ? `Homepage: ${pkg.homepage}\n` : ''}${files.length ? `File: ${files.join(', ')}\n` : ''}`
          + `${'-'.repeat(78)}\n${body}\n`;
      });
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: `${header}\n${parts.join('\n')}` });
    },
  };
}

export default defineConfig({
  server: { port: 5191, strictPort: true }, // Scary Island's dev server owns 5173
  base: './', // works at any path: a domain root or GitHub Pages /secret-cave/
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000, // Rapier's WASM is inlined (~4 MB)
  },
  plugins: [{
    name: 'drop-local-models',
    apply: 'build',
    closeBundle() {
      if (!selfHost) rmSync(resolve('dist/assets/polyfork'), { recursive: true, force: true });
    },
  }, thirdPartyLicences()],
});
