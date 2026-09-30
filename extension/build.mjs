// Bundles the extension into dist/ (load it in chrome://extensions → Load unpacked → extension/dist)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });

const options = {
  entryPoints: { background: 'src/background.ts', content: 'src/content.ts', popup: 'src/popup.ts', bridge: 'src/bridge.ts' },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome110',
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes… reload the extension in chrome://extensions after each build.');
} else {
  await esbuild.build(options);
}
