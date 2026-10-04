/**
 * 验证侧边栏菜单条的 hover 位移 + 十字框能否跟上。
 *
 * 关键点：菜单条 hover 时有 0.22s 的 translateX 过渡。十字框若只在 mousemove 时读矩形，
 * 过渡期间会钉在旧位置（偏差最大 4px 且不会自己归位）。加了逐帧重同步后，
 * 过渡中每一帧的 dx/dy 都应稳定在 −4（设计上的 GAP）。
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
await page.goto('http://localhost:5173/jobs', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(1200);

const measure = () => page.evaluate(() => {
  const item = [...document.querySelectorAll('.sp-sider-item')].find((e) => e.matches(':hover'));
  const layer = [...document.querySelectorAll('div')].find((d) => {
    const s = getComputedStyle(d);
    return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
  });
  if (!item || !layer) return null;
  const a = item.getBoundingClientRect();
  const b = layer.getBoundingClientRect();
  return {
    itemLeft: +a.left.toFixed(1),
    itemTop: +a.top.toFixed(1),
    transform: getComputedStyle(item).transform,
    opacity: +getComputedStyle(layer).opacity,
    dx: +(b.left - a.left).toFixed(1),
    dy: +(b.top - a.top).toFixed(1),
  };
});

const box = await page.evaluate(() => {
  const el = document.querySelector('.sp-sider-item');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * 0.7, y: r.top + r.height / 2 };
});

console.log('\n=== 侧边栏菜单条 hover：位移 + 十字框跟随（采样过渡期间） ===');
console.log('  时刻      条目 left   条目 transform              框偏差 dx/dy   框透明度');
await page.mouse.move(box.x, box.y);

for (const delay of [0, 40, 80, 140, 220, 400, 700]) {
  await page.waitForTimeout(delay === 0 ? 0 : delay - (delay === 40 ? 0 : 0));
  const m = await measure();
  if (!m) { console.log(`  ${String(delay).padStart(4)}ms   (没测到：条目或框不存在)`); continue; }
  console.log(
    `  ${String(delay).padStart(4)}ms  ${String(m.itemLeft).padStart(8)}   ${m.transform.padEnd(26)}  ${String(m.dx).padStart(5)}/${String(m.dy).padStart(5)}  ${m.opacity}`,
  );
  await page.waitForTimeout(delay === 0 ? 40 : 60);
}
await page.waitForTimeout(600);
const settled = await measure();
console.log(`\n  稳态：条目 left=${settled?.itemLeft}  transform=${settled?.transform}  框偏差=${settled?.dx}/${settled?.dy}`);
console.log(`  → 期望 dx/dy 恒为 −4（GAP=4），且 transform 最终为 translateX(4px) 即 matrix(1,0,0,1,4,0)`);

await browser.close();
