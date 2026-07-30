import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Copy the standalone $SOUL console into the build output so the in-app
// "Open $SOUL Console" button (window.open('/soul-token/index.html')) resolves
// in production (Tauri / vite preview), not just under the dev server.
//
// ALLOWLIST, not a directory copy — on purpose. soul-token/ also contains
// soul-token/.env (a testnet PRIVATE_KEY + RPC/Etherscan keys) plus Foundry
// artifacts (out/, cache/, broadcast/, lib/). None of that may ship. We copy
// ONLY the two runtime files the console actually loads: index.html and app.js
// (viem is fetched from a CDN, so there are no local JS deps to bundle).
//
// This keeps $SOUL CODE-isolated (never imported by the Sanctuary app) while
// making it co-SERVED so the button works. If the console ever gains a local
// asset, add it to SOUL_CONSOLE_FILES explicitly — never switch to a recursive
// copy, which would leak .env.
const SOUL_CONSOLE_FILES = ['index.html', 'app.js'];

function copySoulConsole() {
  return {
    name: 'copy-soul-console',
    apply: 'build',
    closeBundle() {
      const srcDir = resolve(__dirname, 'soul-token');
      const outDir = resolve(__dirname, 'dist', 'soul-token');
      mkdirSync(outDir, { recursive: true });
      for (const f of SOUL_CONSOLE_FILES) {
        copyFileSync(resolve(srcDir, f), resolve(outDir, f));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copySoulConsole()],
})
