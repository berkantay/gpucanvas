import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths, so the build works from any folder, such as GitHub Pages' /gpucanvas/.
  base: './',
  server: { port: 5199 },
});
