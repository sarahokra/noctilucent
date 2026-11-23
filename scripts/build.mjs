import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('src/main.template.js');
const replacements = [
  ['VERIFIED_CONTEXT_JSON', 'src/data/verified-context.json'],
  ['VERIFIED_SPACING_JSON', 'src/data/verified-spacing.json'],
];
let output = source;
for (const [name, filename] of replacements) {
  const marker = `/*__${name}__*/""`;
  const data = read(filename);
  JSON.parse(data);
  if (output.split(marker).length !== 2) {
    throw new Error(`Expected exactly one ${name} marker in source template`);
  }
  output = output.replace(marker, JSON.stringify(data));
}
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
if (manifest.id !== pkg.name || manifest.version !== pkg.version) {
  throw new Error('manifest.json and package.json id/version do not match');
}
const target = path.join(root, 'main.js');
const check = process.argv.includes('--check');
if (check) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
    throw new Error('main.js differs from regenerated output; run npm run build');
  }
} else {
  fs.writeFileSync(target, output, 'utf8');
}
const sha = crypto.createHash('sha256').update(output, 'utf8').digest('hex');
console.log(`${check ? 'Verified' : 'Built'} main.js (${Buffer.byteLength(output)} bytes, SHA-256: ${sha})`);
