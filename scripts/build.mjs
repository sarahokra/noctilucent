import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
let output = read('src/main.template.js');
for (const [name, filename] of [['VERIFIED_CONTEXT_JSON','src/data/verified-context.json'],['VERIFIED_SPACING_JSON','src/data/verified-spacing.json']]) {
 const marker = `/*__${name}__*/""`;
 const data = read(filename); JSON.parse(data);
 if(output.split(marker).length !== 2) throw new Error(`Expected exactly one ${name} marker`);
 output = output.replace(marker, () => JSON.stringify(data));
}
const manifest=JSON.parse(read('manifest.json')), pkg=JSON.parse(read('package.json'));
if(manifest.id!==pkg.name || manifest.version!==pkg.version) throw new Error('ID/version mismatch');
const target=path.join(root,'main.js'), check=process.argv.includes('--check');
if(check){if(!fs.readFileSync(target).equals(Buffer.from(output,'utf8'))) throw new Error('main.js differs from generated output');} else fs.writeFileSync(target,output,'utf8');
console.log(`${check?'Verified':'Built'} main.js (${Buffer.byteLength(output)} bytes, SHA-256: ${crypto.createHash('sha256').update(output,'utf8').digest('hex')})`);
