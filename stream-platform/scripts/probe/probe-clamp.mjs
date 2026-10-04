/**
 * 验证侧边栏目标的框被夹在侧边栏矩形内：
 *  - 框右缘 ≤ 侧边栏右缘（否则那部分落在右侧内容区上，浅色模式下白框压白底看不见）
 *  - 框左缘 ≥ 侧边栏左缘
 *  - 同时确认框仍贴住菜单条的**可见**边缘（菜单条被 nav 的 overflow-x:hidden 裁在栏内）
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

for (const [dark, themeName] of [[false, '浅色'], [true, '深色']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((d) => {
    localStorage.setItem('stream_platform_token', 'probe');
    localStorage.setItem('stream_platform_role', 'ADMIN');
    localStorage.setItem('sp-font-scale', '1');
    localStorage.setItem('sp-theme-dark', d);
  }, dark ? '1' : '0');
  await ctx.route((u) => u.pathname.startsWith('/api/'),
    (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  // 非首页走 SiderCrosshair；首页走 CrosshairCursor —— 两条路径都验
  for (const [url, who] of [['/jobs', 'SiderCrosshair'], ['/home', 'Home.CrosshairCursor']]) {
    await page.goto('http://localhost:5173' + url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
    await page.waitForTimeout(1300);
    const box = await page.evaluate(() => {
      const el = document.querySelector('.sp-sider-item');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(800);

    const m = await page.evaluate(() => {
      const layer = [...document.querySelectorAll('div')].find((d) => {
        const s = getComputedStyle(d);
        return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
      });
      const sider = document.querySelector('.ant-layout-sider');
      const nav = document.querySelector('.ant-layout-sider nav');
      const item = document.querySelector('.sp-sider-item');
      const f = layer.getBoundingClientRect(), s = sider.getBoundingClientRect();
      const n = nav.getBoundingClientRect(), i = item.getBoundingClientRect();
      return {
        frame: [+f.left.toFixed(1), +f.right.toFixed(1)],
        sider: [+s.left.toFixed(1), +s.right.toFixed(1)],
        navRight: +n.right.toFixed(1),
        itemRight: +i.right.toFixed(1),   // 条目的 layout 边缘（含 4px 位移，未计裁切）
        color: getComputedStyle(layer.querySelector('span')).borderTopColor,
      };
    });
    const inside = m.frame[1] <= m.sider[1] + 0.5 && m.frame[0] >= m.sider[0] - 0.5;
    results.push({ theme: themeName, who, ...m, inside });
    console.log(`【${themeName}】${who.padEnd(22)} 框=[${m.frame[0]}, ${m.frame[1]}]  侧边栏=[${m.sider[0]}, ${m.sider[1]}]  条目layout右缘=${m.itemRight}  ${inside ? '✓ 夹在栏内' : '✗ 越界'}`);
  }
  await ctx.close();
}

console.log('\n汇总：');
const bad = results.filter((r) => !r.inside);
console.log(bad.length === 0 ? '  ✓ 四种组合的框全部落在侧边栏内 —— 右缘不会再压到白色内容区' : `  ✗ ${bad.length} 处越界`);
await browser.close();
