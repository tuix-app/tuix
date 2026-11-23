import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (JSON.stringify(Object.keys(packageJson.dependencies).sort()) !== JSON.stringify(['modern-screenshot', 'phoenix', 'preact'])) {
  throw new Error('Runtime dependency allowlist changed: review the dependency and update this check explicitly.');
}
await build({ entryPoints: ['src/loader.js'], outfile: 'dist/tuix.js', minify: true, target: 'es5', legalComments: 'none' });
await build({ entryPoints: ['src/shopify-loader.js'], outfile: 'dist/shopify.js', minify: true, target: 'es5', legalComments: 'none' });
const shopifyLoader = await readFile('dist/shopify.js');
const shopifySize = gzipSync(shopifyLoader).length;
if (shopifySize >= 2048) throw new Error(`Shopify loader exceeds 2 KiB gzip: ${shopifySize}`);
const shopify = { loader: 'shopify.js', integrity: 'sha384-' + createHash('sha384').update(shopifyLoader).digest('base64'), gzipBytes: shopifySize };
let coreBytes = 0, screenshotBytes = 0, promptBytes = 0;
for (const file of await readdir('dist')) {
  if (!file.endsWith('.js') || ['tuix.js', 'shopify.js'].includes(file)) continue;
  const bytes = gzipSync(await readFile('dist/' + file)).length;
  if (file.startsWith('screenshot-')) screenshotBytes += bytes;
  else if (file.startsWith('verify-prompt-')) promptBytes += bytes;
  else coreBytes += bytes;
}
// Editing-event isolation took the former 60 KiB boundary to 61 KiB, and closing the
// sidebar on a click outside it to 62 KiB. Keep a bounded budget without trimming
// input protection for size.
// Phoenix 1.8.17 and Vite 8.3.8 (Rolldown 1.2.19) emit about 320 bytes more for the same
// source, which took the boundary to 63 KiB.
// The verify prompt's card loads only for a reporter with a fix to check, so it has
// its own budget instead of taking from the core every visitor downloads.
if (coreBytes >= 63 * 1024 || screenshotBytes >= 25 * 1024 || promptBytes >= 4 * 1024) throw new Error(`Widget budget exceeded: core=${coreBytes}, screenshot=${screenshotBytes}, prompt=${promptBytes}`);
const loader = await readFile('dist/tuix.js');
const size = gzipSync(loader).length;
if (size >= 2048) throw new Error(`Loader exceeds 2 KiB gzip: ${size}`);
await writeFile('dist/manifest.json', JSON.stringify({ version: packageJson.version, shopify, loader: 'tuix.js', integrity: 'sha384-' + createHash('sha384').update(loader).digest('base64'), gzipBytes: size, coreGzipBytes: coreBytes, screenshotGzipBytes: screenshotBytes }, null, 2) + '\n');
console.log(`Loader: ${size} bytes gzip`);

console.log(`Shopify loader: ${shopifySize} bytes gzip`);
