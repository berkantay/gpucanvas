import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', react: 'src/react.tsx' },
  format: 'esm',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  // The React adapter uses hooks, so frameworks with server components must load it on the
  // client. The directive goes on that entry only; the core stays a shared chunk.
  async onSuccess() {
    const file = 'dist/react.js';
    await writeFile(file, `'use client';\n${await readFile(file, 'utf8')}`);
    // One more line on top: shift the source map by one line to match.
    const map = JSON.parse(await readFile(`${file}.map`, 'utf8'));
    map.mappings = `;${map.mappings}`;
    await writeFile(`${file}.map`, JSON.stringify(map));
  },
});
