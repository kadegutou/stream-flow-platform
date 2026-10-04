/**
 * 验证两项修复：
 *  ① 菜单条 hover 后 nav 不再横向溢出（不再冒横向滚动条）
 *  ② 最下面一排节点的提示文字完整落在 viewBox 内（不再被裁）
 */
import { chromium } from 'playwright-core';

const TIP_OFFSET = 56, TEXT_H = 14, VB_H = 320;
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
await page.goto('http://localhost:5173/home', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(1500);

// ── ① nav 横向溢出
const navState = async (label) => {
  const r = await page.evaluate(() => {
    const nav = document.querySelector('.ant-layout-sider nav');
    const last = [...document.querySelectorAll('.sp-sider-item')].pop();
    const ox = getComputedStyle(nav).overflowX;
    return {
      scrollW: nav.scrollWidth, clientW: nav.clientWidth,
      overflowX: ox,
      // 横向滚动条出现的**充要条件**：overflow-x 是 auto/scroll **且** 内容横向溢出。
      // hidden 时无论溢出与否都不会出滚动条 —— 光看 scrollWidth 会误判。
      willShowHScrollbar: (ox === 'auto' || ox === 'scroll') && nav.scrollWidth > nav.clientWidth,
      itemRight: +last.getBoundingClientRect().right.toFixed(1),
    };
  });
  console.log(`  ${label}  scrollWidth=${r.scrollW} clientWidth=${r.clientW} overflowX=${r.overflowX} 会出横向滚动条=${r.willShowHScrollbar} 条目右缘=${r.itemRight}`);
  return r;
};
console.log('\n=== ① nav 横向溢出 ===');
await page.mouse.move(1200, 700); await page.waitForTimeout(400);
await navState('未悬停:');
await page.mouse.move(120, 364); await page.waitForTimeout(800);
const hovered = await navState('悬停后:');
console.log(hovered.willShowHScrollbar ? '  ✗ 仍可横向滚动（会出滚动条）' : '  ✓ 已不可横向滚动 —— 不会再冒白条');

// ── ② 提示文字是否落在 viewBox 内：连续采样，取出现过的最大 cy
console.log('\n=== ② 提示文字是否被裁（连续采样 12 秒，取最大 cy） ===');
let maxCy = -1, samples = 0, nodeCounts = [];
for (let i = 0; i < 24; i++) {
  const r = await page.evaluate(() => {
    const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
    const cs = [...svg.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') > 10);
    return { maxCy: cs.length ? Math.max(...cs.map((c) => +c.getAttribute('cy'))) : null, n: cs.length };
  });
  if (r.maxCy !== null) { maxCy = Math.max(maxCy, r.maxCy); nodeCounts.push(r.n); samples++; }
  await page.waitForTimeout(500);
}
const tipBottom = maxCy + TIP_OFFSET + TEXT_H;
console.log(`  ${samples} 次采样，节点数 ${Math.min(...nodeCounts)}~${Math.max(...nodeCounts)}`);
console.log(`  出现过的最大 cy = ${maxCy.toFixed(1)}`);
console.log(`  提示文字底部 = ${maxCy.toFixed(1)} + ${TIP_OFFSET}(偏移) + ${TEXT_H}(字高) = ${tipBottom.toFixed(1)}`);
console.log(`  viewBox 高 = ${VB_H}  →  ${tipBottom <= VB_H ? '✓ 完整落在画布内' : `✗ 仍超出 ${(tipBottom - VB_H).toFixed(1)}`}`);

await browser.close();
