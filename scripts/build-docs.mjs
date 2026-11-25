// Genera los PDF de entrega en entregables/ a partir de docs/*.md (usa Microsoft Edge o Chrome en modo headless).
// Uso: npm run docs:pdf                                   (sin URL de produccion)
//      npm run docs:pdf -- https://tu-app.onrender.com    (rellena la URL y adjunta la evidencia de produccion)
import { marked } from 'marked';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = process.argv[2]?.replace(/\/+$/, '');
if (url && !/^https:\/\/[^/\s]+$/.test(url)) {
  console.error('La URL debe ser https://...');
  process.exit(1);
}

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = browsers.find((b) => existsSync(b));
if (!browser) {
  console.error('No se encontro Edge ni Chrome para generar los PDF.');
  process.exit(1);
}

const css = `@page{size:Letter;margin:18mm 16mm}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#1d2433}
h1{color:#1f3a5f;font-size:20pt;border-bottom:3px solid #2b8a9e;padding-bottom:6px}h2{color:#1f3a5f;font-size:14pt;margin-top:18px;border-bottom:1px solid #d5dce6}
h3{color:#2b8a9e;font-size:12pt}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9pt}tr{page-break-inside:avoid}
th{background:#1f3a5f;color:#fff;text-align:left;padding:5px}td{border:1px solid #d5dce6;padding:5px;vertical-align:top;word-break:break-word}
tr:nth-child(even) td{background:#f4f7fb}code{background:#eef2f7;padding:1px 4px;border-radius:3px;font-size:8.5pt}
pre{background:#f4f7fb;border:1px solid #d5dce6;padding:8px;font-size:8pt;white-space:pre-wrap;word-break:break-all}
blockquote{border-left:4px solid #ed6c02;background:#fff4e5;margin:8px 0;padding:6px 12px}a{color:#1f5f8b;word-break:break-all}`;

const docs = ['deep-research', 'security-report', 'threat-model'];
if (existsSync('entregables/evidencia-produccion.md')) docs.push('../entregables/evidencia-produccion');

mkdirSync('entregables', { recursive: true });
const work = mkdtempSync(path.join(tmpdir(), 'sv-docs-'));

for (const name of docs) {
  let md = readFileSync(path.join('docs', `${name}.md`), 'utf8').replace(/```mermaid[\s\S]*?```/g, '');
  if (url) md = md.replaceAll('`https://<completar>.onrender.com`', url).replaceAll('https://<completar>.onrender.com', url);
  const base = path.basename(name);
  const html = path.join(work, `${base}.html`);
  writeFileSync(html, `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${base}</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`);
  const pdf = path.resolve('entregables', `${base}.pdf`);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: 'ignore' });
  console.log(`PDF generado: ${pdf}`);
}
