/**
 * 定位「鼠标放到菜单条上时，运行监控下方出现的白条」。
 * 做法：hover 最后一条菜单项后，在它下方若干 y 处取 elementsFromPoint 的整个图层栈，
 * 把每个元素的位置/背景/边框/层级打出来 —— 谁在白条位置上、谁带浅色底，一目了然。
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
await page.goto('http://localhost:5173/home', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(1500);

const desc = (el) => {
  if (!el) return '(null)';
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return `<${el.tagName.toLowerCase()}${el.className ? ' class="' + String(el.className).slice(0, 28) + '"' : ''}> ` +
    `box=[${r.left.toFixed(0)},${r.top.toFixed(0)},${r.width.toFixed(0)}x${r.height.toFixed(0)}] ` +
    `bg=${s.backgroundColor} borderBottom=${s.borderBottomWidth} ${s.borderBottomColor} z=${s.zIndex}`;
};

const info = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sp-sider-item')];
  const last = items[items.length - 1];
  const r = last.getBoundingClientRect();
  return { label: last.textContent.slice(0, 12), bottom: r.bottom, right: r.right, left: r.left, w: r.width };
});
console.log(`最后一项「${info.label}」 box: left=${info.left} right=${info.right} bottom=${info.bottom} w=${info.width ?? info.w}`);

console.log('\n--- 未悬停时，下方各 y 的图层栈 ---');
for (const dy of [2, 6, 12, 24]) {
  const stack = await page.evaluate(([x, y]) =>
    document.elementsFromPoint(x, y).map((e) => {
      const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return `<${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}> box=[${r.left.toFixed(0)},${r.top.toFixed(0)},${r.width.toFixed(0)}x${r.height.toFixed(0)}] bg=${s.backgroundColor} z=${s.zIndex}`;
    }), [100, info.bottom + dy]);
  console.log(`  y=底边+${dy}:`);
  for (const l of stack) console.log('     ' + l);
}

// 悬停最后一项
await page.mouse.move(120, info.bottom - 20);
await page.waitForTimeout(900);
console.log('\n--- 悬停后，下方各 y 的图层栈 ---');
for (const dy of [2, 6, 12, 24]) {
  const stack = await page.evaluate(([x, y]) =>
    document.elementsFromPoint(x, y).map((e) => {
      const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return `<${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}> box=[${r.left.toFixed(0)},${r.top.toFixed(0)},${r.width.toFixed(0)}x${r.height.toFixed(0)}] bg=${s.backgroundColor} z=${s.zIndex}`;
    }), [100, info.bottom + dy]);
  console.log(`  y=底边+${dy}:`);
  for (const l of stack) console.log('     ' + l);
}

// 悬停项自身右边缘是否溢出侧边栏
const spill = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sp-sider-item')];
  const last = items[items.length - 1];
  const sider = document.querySelector('.ant-layout-sider');
  const a = last.getBoundingClientRect(), b = sider.getBoundingClientRect();
  return { itemRight: +a.right.toFixed(1), siderRight: +b.right.toFixed(1), overflow: +(a.right - b.right).toFixed(1), siderOverflowX: getComputedStyle(sider).overflowX, siderOverflow: getComputedStyle(sider).overflow };
});
console.log(`\n悬停项右边缘=${spill.itemRight}  侧边栏右边缘=${spill.siderRight}  溢出=${spill.overflow}px`);
console.log(`侧边栏 overflow=${spill.siderOverflow} (x=${spill.siderOverflowX})`);
await browser.close();
