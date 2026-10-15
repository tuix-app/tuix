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
let coreBytes = 0, screenshotBytes = 0;
for (const file of await readdir('dist')) {
  if (!file.endsWith('.js') || ['tuix.js', 'shopify.js'].includes(file)) continue;
  const bytes = gzipSync(await readFile('dist/' + file)).length;
  if (file.startsWith('screenshot-')) screenshotBytes += bytes; else coreBytes += bytes;
}
if (coreBytes >= 60 * 1024 || screenshotBytes >= 25 * 1024) throw new Error(`Widget budget exceeded: core=${coreBytes}, screenshot=${screenshotBytes}`);
const loader = await readFile('dist/tuix.js');
const size = gzipSync(loader).length;
if (size >= 2048) throw new Error(`Loader exceeds 2 KiB gzip: ${size}`);
await writeFile('dist/manifest.json', JSON.stringify({ version: packageJson.version, shopify, loader: 'tuix.js', integrity: 'sha384-' + createHash('sha384').update(loader).digest('base64'), gzipBytes: size, coreGzipBytes: coreBytes, screenshotGzipBytes: screenshotBytes }, null, 2) + '\n');
console.log(`Loader: ${size} bytes gzip`);

console.log(`Shopify loader: ${shopifySize} bytes gzip`);
