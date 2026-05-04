/**
 * Node.js Playwright render script for Excalidraw files.
 * Usage: node render_node.mjs <path.excalidraw> [output.png]
 */
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:\\Users\\hiepnguyen\\AppData\\Roaming\\npm\\node_modules\\playwright\\index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.excalidraw$/, '.png');

if (!inputPath) {
  console.error('Usage: node render_node.mjs <file.excalidraw> [output.png]');
  process.exit(1);
}

const raw = readFileSync(inputPath, 'utf-8');
const data = JSON.parse(raw);

// Compute bounding box
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const el of data.elements || []) {
  if (el.isDeleted) continue;
  const x = el.x || 0, y = el.y || 0, w = el.width || 0, h = el.height || 0;
  if ((el.type === 'arrow' || el.type === 'line') && el.points) {
    for (const [px, py] of el.points) {
      minX = Math.min(minX, x + px); minY = Math.min(minY, y + py);
      maxX = Math.max(maxX, x + px); maxY = Math.max(maxY, y + py);
    }
  } else {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.abs(w)); maxY = Math.max(maxY, y + Math.abs(h));
  }
}
const padding = 80;
const vpWidth = Math.min(Math.ceil(maxX - minX + padding * 2), 2400);
const vpHeight = Math.max(Math.ceil(maxY - minY + padding * 2), 600);

const templateHtml = readFileSync(path.join(__dirname, 'render_template.html'), 'utf-8');

// Spin up a local HTTP server to serve the template (avoids file:// restrictions)
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(templateHtml);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const templateUrl = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: vpWidth, height: vpHeight }, deviceScaleFactor: 2 });

await page.goto(templateUrl);
await page.waitForFunction('window.__moduleReady === true', { timeout: 60000 });

const result = await page.evaluate((d) => window.renderDiagram(d), data);
if (!result || !result.success) {
  console.error('Render failed:', result?.error || 'unknown');
  await browser.close();
  server.close();
  process.exit(1);
}

await page.waitForFunction('window.__renderComplete === true', { timeout: 15000 });

const svgEl = await page.$('#root svg');
if (!svgEl) {
  console.error('No SVG element found');
  await browser.close();
  server.close();
  process.exit(1);
}

await svgEl.screenshot({ path: outputPath });
await browser.close();
server.close();
console.log(outputPath);
