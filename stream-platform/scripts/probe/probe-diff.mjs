/**
 * 像素级取证：对同一块区域，"未悬停"与"悬停最后一条菜单项"各截一张，
 * 把两张 PNG 送进浏览器用 canvas 解码，逐像素比对，输出**变化像素的包围盒**与颜色。
 * 这样"白条到底是什么、在哪"就是硬数据，不靠肉眼读图。
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
// 关掉光标层的过渡动画干扰：截图前先把鼠标移开
await page.mouse.move(1200, 700);

const info = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sp-sider-item')];
  const el = items[items.length - 1];
  const r = el.getBoundingClientRect();
  return { bottom: r.bottom, top: r.top, x: r.left + 60, y: r.top + r.height / 2 };
});

const clip = { x: 0, y: Math.round(info.bottom - 30), width: 280, height: 90 };
console.log(`区域 clip=${JSON.stringify(clip)}（最后一条菜单项底边 y=${info.bottom.toFixed(0)}）`);

const before = (await page.screenshot({ clip })).toString('base64');
await page.mouse.move(info.x, info.y);
await page.waitForTimeout(900);
const after = (await page.screenshot({ clip })).toString('base64');

const diff = await page.evaluate(async ([b1, b2, w, h]) => {
  const load = (b64) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = 'data:image/png;base64,' + b64;
  });
  const [i1, i2] = await Promise.all([load(b1), load(b2)]);
  const get = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const d1 = get(i1), d2 = get(i2);
  const W = i1.width, H = i1.height;
  let minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
  const rows = {};
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) {
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        rows[y] = (rows[y] || 0) + 1;
      }
    }
  }
  // 变化最集中的几行，给出该行的颜色样本（取该行最左侧变化像素的"悬停后"颜色）
  const topRows = Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([y, cnt]) => {
    const yy = +y;
    let sx = -1;
    for (let x = 0; x < W; x++) { const i = (yy * W + x) * 4; if (d1[i] !== d2[i] || d1[i+1] !== d2[i+1] || d1[i+2] !== d2[i+2]) { sx = x; break; } }
    const i = (yy * W + sx) * 4;
    return { y: yy, count: cnt, x: sx, before: `rgb(${d1[i]},${d1[i+1]},${d1[i+2]})`, after: `rgb(${d2[i]},${d2[i+1]},${d2[i+2]})` };
  });
  return { W, H, changed: n, bbox: n ? [minX, minY, maxX, maxY] : null, topRows };
}, [before, after, clip.width, clip.height]);

console.log(`\n画布 ${diff.W}x${diff.H}（2x 缩放，故 CSS 尺寸为 ${diff.W / 2}x${diff.H / 2}）`);
console.log(`变化像素 ${diff.changed}`);
if (diff.bbox) {
  const [x0, y0, x1, y1] = diff.bbox;
  console.log(`变化包围盒（2x 坐标）[${x0},${y0}] ~ [${x1},${y1}]`);
  console.log(`  换算成 CSS：x=${(x0 / 2).toFixed(0)}..${(x1 / 2).toFixed(0)}  y=${(y0 / 2 + clip.y).toFixed(0)}..${(y1 / 2 + clip.y).toFixed(0)}（页面绝对坐标）`);
}
console.log('\n变化最集中的行：');
for (const r of diff.topRows) {
  console.log(`  y=${r.y}(画布) 该行变化 ${r.count} 像素  最左变化点 x=${r.x}  悬停前 ${r.before} → 悬停后 ${r.after}`);
}

await browser.close();
