/**
 * 量两件事：
 *  ① 节点标签（如 XML2JSON）是否溢出圆形 —— 标签宽度 vs 圆直径
 *  ② 悬停提示文字与节点圆的**实际**间距（不是 y 偏移，是渲染后的几何间隙）
 *     <text y> 是基线，不是顶边，所以 y = cy+40 并不等于"离圆 40"。
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
await page.waitForSelector('svg[viewBox="0 0 900 320"]', { timeout: 15000 });
await page.waitForTimeout(1500);

// ① 标签宽度 vs 圆直径
const labels = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
  const out = [];
  for (const c of svg.querySelectorAll('circle')) {
    const r = +c.getAttribute('r');
    if (!(r > 10)) continue;
    const g = c.closest('g');
    const t = [...g.querySelectorAll('text')][0];       // 第一个 text 是节点标签
    if (!t) continue;
    const tb = t.getBBox();
    out.push({ label: t.textContent, r, textW: +tb.width.toFixed(1), textH: +tb.height.toFixed(1) });
  }
  return out;
});
console.log('\n=== ① 节点标签宽度 vs 圆直径 ===');
const seen = new Set();
for (const l of labels.sort((a, b) => b.textW - a.textW)) {
  if (seen.has(l.label)) continue;
  seen.add(l.label);
  const dia = l.r * 2;
  const slack = (dia - l.textW) / 2;   // 单边余量
  const warn = l.textW > dia ? '  ✗ 溢出圆形' : slack < 3 ? '  ⚠ 余量不足 3' : '';
  console.log(`  ${l.label.padEnd(10)} 字宽=${String(l.textW).padStart(5)}  圆直径=${dia}  单边余量=${slack.toFixed(1)}${warn}`);
}

// ② 悬停提示与圆的几何间隙
const node = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
  const c = [...svg.querySelectorAll('circle')].find((x) => +x.getAttribute('r') > 10);
  const b = c.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await page.mouse.move(node.x, node.y);
await page.waitForTimeout(600);

const gap = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
  for (const g of svg.querySelectorAll('g')) {
    const ts = [...g.querySelectorAll('text')];
    if (ts.length < 2) continue;               // 第二个 text 才是 tip
    if (+(g.getAttribute('opacity') ?? 1) < 0.9) continue;
    const cRect = g.querySelector('circle').getBoundingClientRect();
    const tRect = ts[1].getBoundingClientRect();
    return {
      tip: ts[1].textContent,
      circleBottom: +cRect.bottom.toFixed(1),
      circleTop: +cRect.top.toFixed(1),
      r: +(cRect.height / 2).toFixed(1),
      tipTop: +tRect.top.toFixed(1),
      tipH: +tRect.height.toFixed(1),
      gap: +(tRect.top - cRect.bottom).toFixed(1),
      tipYAttr: ts[1].getAttribute('y'),
      cy: ((+cRect.top + +cRect.bottom) / 2).toFixed(1),
    };
  }
  return null;
});
console.log('\n=== ② 悬停提示与节点的几何间隙（屏幕像素，无歧义） ===');
if (!gap) console.log('  没抓到提示文字（可能没悬停到）');
else {
  console.log(`  提示文字 = 「${gap.tip}」`);
  console.log(`  圆：中心 y=${gap.cy} 半径=${gap.r} 底边 y=${gap.circleBottom}`);
  console.log(`  提示文字 顶边 y=${gap.tipTop}（高 ${gap.tipH}）`);
  console.log(`  → 实际几何间隙 = ${gap.gap} px   ${gap.gap < 0 ? '← 负值：文字与圆重叠' : ''}`);
  console.log(`     （SVG 里 tip 的 y 属性 = ${gap.tipYAttr}，那是**基线**，不等于离圆的距离）`);
}

await browser.close();
