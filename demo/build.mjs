// Bundles the editor into ONE self-contained HTML file (scripts, styles and fonts inline) for hosting as a demo.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['demo/entry.tsx'],
  bundle: true,
  minify: true,
  write: false,
  outdir: 'demo/out',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  format: 'iife',
  alias: { canvas: './src/lib/empty.ts' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  charset: 'ascii',
  logLevel: 'warning',
});
let js = '', css = '';
for (const f of out.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  else if (f.path.endsWith('.css')) css = f.text;
}
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const html = `<title>Hall Seating Planner</title>
<style>
html, body { height: 100%; }
${css}
#root { height: 100%; }
.app { height: 100%; }
</style>
<div id="root"></div>
<script>${js}</script>
`;
mkdirSync('demo/dist', { recursive: true });
writeFileSync('demo/dist/index.html', html);
console.log('demo/dist/index.html', (html.length / 1e6).toFixed(2) + ' MB');
