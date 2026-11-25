// A08: agrega Subresource Integrity (sha384) a cada JS/CSS que genera Vite en dist/index.html.
// Si alguien altera un archivo servido (CDN, proxy, cache), el navegador se niega a ejecutarlo.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const file = path.join(dist, 'index.html');
let html = readFileSync(file, 'utf8');
let count = 0;

html = html.replace(/<(script|link)\b([^>]*?)\s(src|href)="(\/assets\/[^"]+\.(?:js|css))"([^>]*)>/g, (tag, name, before, attr, url, after) => {
  if (/\sintegrity=/.test(tag)) return tag;
  const hash = createHash('sha384').update(readFileSync(path.join(dist, url))).digest('base64');
  count++;
  const cross = /\scrossorigin/.test(tag) ? '' : ' crossorigin="anonymous"';
  return `<${name}${before} ${attr}="${url}" integrity="sha384-${hash}"${cross}${after}>`;
});

writeFileSync(file, html);
console.log(`SRI agregado a ${count} recurso(s) en dist/index.html`);
