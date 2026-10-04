/**
 * 截图取证：
 *  ① 侧边栏「运行监控」hover 时下方出现的白条
 *  ② 拓扑图底部节点悬停时，提示文字被裁切的情况
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

// 截图统一写到脚本旁边的 out/（该目录已加进 .gitignore）
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('stream_platform_token', 'probe');
  localStorage.setItem('stream_platform_role', 'ADMIN');
  localStorage.setItem('sp-font-scale', '1');
});
await ctx.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/home', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(1600);

// ① 侧边栏最后一个菜单项（运行监控）+ 它下方一段
const last = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sp-sider-item')];
  const el = items[items.length - 1];
  const r = el.getBoundingClientRect();
  return { label: el.textContent, x: r.left + r.width * 0.6, y: r.top + r.height / 2, bottom: r.bottom };
});
console.log(`① 最后一项「${last.label}」矩形底边 y=${last.bottom.toFixed(0)}`);
await page.mouse.move(last.x, last.y);
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, 'shot-sider.png'), clip: { x: 0, y: Math.max(0, last.bottom - 160), width: 300, height: 260 } });
console.log('   → out/shot-sider.png');

// 量一下 hover 时那一带有没有"更亮"的东西
const barInfo = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sp-sider-item')];
  const el = items[items.length - 1];
  const r = el.getBoundingClientRect();
  const out = [];
  for (const dy of [-2, 1, 3, 6, 12]) {
    const probeY = r.bottom + dy;
    const hit = document.elementFromPoint(60, probeY);
    out.push(`y=底边${dy >= 0 ? '+' : ''}${dy}: <${hit?.tagName} class="${(hit?.className || '').toString().slice(0, 40)}">`);
  }
  return out;
});
console.log('   底边附近命中：'); for (const l of barInfo) console.log('     ' + l);

// ② 拓扑图：找 y 最大的节点，悬停后截拓扑+终端区域
const low = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
  const cs = [...svg.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') > 10);
  let best = null;
  for (const c of cs) { const cy = +c.getAttribute('cy'); if (!best || cy > best.cy) best = { cy, c }; }
  const r = best.c.getBoundingClientRect();
  const svgR = svg.getBoundingClientRect();
  return { nodeCy: best.cy, x: r.left + r.width / 2, y: r.top + r.height / 2, svgTop: svgR.top, svgBottom: svgR.bottom, svgH: svgR.height, canvasH: 320 };
});
console.log(`\n② 最低节点 cy=${low.nodeCy}（viewBox 高 320）`);
await page.mouse.move(low.x, low.y);
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'shot-topo-bottom.png'), clip: { x: 200, y: Math.max(0, low.y - 80), width: 900, height: 340 } });
console.log(`   → out/shot-topo-bottom.png`);
console.log(`   渲染出来 SVG 高=${low.svgH.toFixed(0)}px（viewBox 高 ${low.canvasH}），缩放 ${(low.svgH / low.canvasH).toFixed(3)}`);
console.log(`   节点在 viewBox 里 cy=${low.nodeCy}，提示文字在 cy+56=${low.nodeCy + 56} —— ${low.nodeCy + 56 > low.canvasH ? '超出 viewBox 底部，会被 SVG 裁掉' : '在 viewBox 内'}`);

await browser.close();
