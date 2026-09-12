import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'biotool-offline-shell',
      generateBundle(_options, bundle) {
        const packageRoots = new Set([
          resolve('node_modules/@fontsource/ibm-plex-sans'),
          resolve('node_modules/@fontsource/ibm-plex-mono'),
        ]);
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          for (const id of Object.keys(output.modules)) {
            if (id.includes('\0')) continue;
            const marker = id.lastIndexOf('/node_modules/');
            if (marker === -1) continue;
            const prefix = id.slice(0, marker + '/node_modules/'.length);
            const name = id.slice(prefix.length).match(/^(?:@[^/]+\/)?[^/]+/)?.[0];
            if (name) packageRoots.add(prefix + name);
          }
        }
        const licenses = [...packageRoots].flatMap((root) => {
          const name: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name;
          if (typeof name !== 'string') throw new Error(`Dependency package name missing: ${root}`);
          const filename = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt', 'LICENCE', 'LICENSE-MIT']
            .find((candidate) => existsSync(resolve(root, candidate)));
          if (!filename) this.warn(`No root license file found for bundled dependency ${name}.`);
          return filename ? [`${name}\n${'='.repeat(name.length)}\n${readFileSync(resolve(root, filename), 'utf8')}`] : [];
        });
        this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: licenses.join('\n\n') });
        const files = Object.keys(bundle).filter((file) => !file.endsWith('.map'));
        const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
        const assets = [...new Set(['./', './index.html', './examples/1crn.cif', './third-party-licenses.txt', ...files.map((file) => `./${file}`)])];
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `
const PREFIX = 'biotool-shell-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(PREFIX) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      const page = await cache.match(new URL('./index.html', self.registration.scope), { ignoreVary: true });
      return page || Response.error();
    }));
  } else {
    // Only this app's static precache is consulted. CORS Vary: Origin must not
    // distinguish a precache fetch from the browser's module/font request.
    event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request, { ignoreVary: true }))
      .then(cached => cached || fetch(event.request)));
  }
});`,
        });
      },
    },
  ],
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
