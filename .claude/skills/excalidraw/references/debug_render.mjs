import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:\\Users\\hiepnguyen\\AppData\\Roaming\\npm\\node_modules\\playwright\\index.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const templateHtml = readFileSync(path.join(__dirname, 'render_template.html'), 'utf-8');
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(templateHtml);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
console.log('Server at port:', port);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('console', msg => console.log('BROWSER [' + msg.type() + ']:', msg.text()));
page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
page.on('requestfailed', req => console.log('REQUEST_FAILED:', req.url(), req.failure()?.errorText));

await page.goto(`http://127.0.0.1:${port}/`);
console.log('Page loaded, waiting 15s for module...');
await page.waitForTimeout(15000);
const ready = await page.evaluate('window.__moduleReady');
console.log('__moduleReady:', ready);
await browser.close();
server.close();
