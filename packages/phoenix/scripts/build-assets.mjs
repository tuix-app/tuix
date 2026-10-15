// Run from this package. Customers receive these assets in the Hex archive.
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const hostedOnly = process.argv.includes('--hosted-only');
const dist = process.argv[2] === '--hosted-only' ? '../widget/dist' : (process.argv[2] || '../widget/dist');
const files = hostedOnly ? [] : await Promise.all((await readdir(dist)).filter(n => /^[\w.-]+\.(js|woff2)$/.test(n)).sort().map(async n => [n, await readFile(path.join(dist, n))]));
const sri = bytes => 'sha384-' + createHash('sha384').update(bytes).digest('base64');
const manifest = hostedOnly ? {} : JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (!hostedOnly && sri(files.find(([n]) => n === 'tuix.js')[1]) !== manifest.integrity) throw Error('Widget manifest mismatch');
files.push(['phoenix.js', await readFile('assets/bootstrap.js')]);
const digest = createHash('sha256').update(JSON.stringify(files.map(([n, b]) => [n, createHash('sha256').update(b).digest('hex')]))).digest('hex');
await rm('priv/static', { recursive: true, force: true });
await mkdir(`priv/static/${digest}`, { recursive: true });
for (const [name, bytes] of files) await writeFile(`priv/static/${digest}/${name}`, bytes);
const entry = name => ({ path: `${digest}/${name}`, integrity: sri(files.find(([n]) => n === name)[1]) });
await writeFile('priv/manifest.json', JSON.stringify({ widgetVersion: manifest.version, bootstrap: entry('phoenix.js'), ...(hostedOnly ? {} : { loader: entry('tuix.js') }) }, null, 2) + '\n');
