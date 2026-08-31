import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';

// Version/Build-Infos zur Build-Zeit einbacken, damit jeder Fehlerbericht
// eindeutig einer App-Version zugeordnet werden kann.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* kein Git verfügbar (z. B. im Auslieferungs-Tarball) — 'unknown' belassen */
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
});
