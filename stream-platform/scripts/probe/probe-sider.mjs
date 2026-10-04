/**
 * 测侧边栏十字框（SiderCrosshair，已 portal 到 body）在字体缩放下的位置。
 * 目的：确认「portal 到 body」能否免疫 zoom —— 若不能，则两个组件都要做 ÷zoom 换算。
 */
import { chromium } from 'playwright-core';

const SCALE = process.argv[2] ?? '1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

await ctx.addInitScript((scale) => {
  localStorage.setItem('stream_platform_token', 'probe-fake-token');
  localStorage.setItem('stream_platform_nickname', '探针');
  localStorage.setItem('stream_platform_role', 'ADMIN');
  localStorage.setItem('sp-font-scale', scale);
}, SCALE);
await ctx.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto('http://localhost:5173/jobs', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(1500);

console.log(`\n=== 侧边栏十字框 · 字体缩放 = ${SCALE} ===`);
console.log(`  body.style.zoom = ${await page.evaluate(() => document.body.style.zoom)}`);

const item = await page.evaluate(() => {
  const el = document.querySelector('.sp-sider-item');
  const r = el.getBoundingClientRect();
  return { rect: [r.left, r.top, r.width, r.height], cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
await page.mouse.move(item.cx, item.cy);
await page.waitForTimeout(300);

const cursor = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => {
    const s = getComputedStyle(d);
    return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { rect: [r.left, r.top, r.width, r.height], transform: el.style.transform, parent: el.parentElement?.tagName };
});
if (!cursor) { console.log('  !! 找不到框（侧边栏版可能未渲染）'); await browser.close(); process.exit(0); }

const f = (a) => a.map((n) => n.toFixed(1)).join(', ');
console.log(`  菜单条矩形   = [${f(item.rect)}]`);
console.log(`  框内联 transform = ${cursor.transform}   父元素=${cursor.parent}`);
console.log(`  框实际画出   = [${f(cursor.rect)}]`);
console.log(`  偏差 dx=${(cursor.rect[0] - item.rect[0]).toFixed(1)}  dy=${(cursor.rect[1] - item.rect[1]).toFixed(1)}   （设计上框比目标大 GAP=4，故 dx/dy 应为 -4）`);
await browser.close();
