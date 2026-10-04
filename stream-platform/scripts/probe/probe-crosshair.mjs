/**
 * 实测十字框跟随层在字体缩放下的真实位置。
 *
 * 目的：不是复述推测，而是把「按钮矩形」与「框实际画在哪」都量出来，
 * 从而判定根因是坐标换算错、还是包含块（containing block）错、还是两者叠加。
 *
 * 用法：node scripts/probe/probe-crosshair.mjs <scale>
 *   scale 传 1 / 1.3 / 0.85
 */
import { chromium } from 'playwright-core';

const SCALE = process.argv[2] ?? '1';
const APP = 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// 伪造登录态（后端不一定在跑，Home 的取数失败不影响光标层渲染）
await ctx.addInitScript((scale) => {
  localStorage.setItem('stream_platform_token', 'probe-fake-token');
  localStorage.setItem('stream_platform_nickname', '探针');
  localStorage.setItem('stream_platform_role', 'ADMIN');
  localStorage.setItem('sp-font-scale', scale);
}, SCALE);

// 后端不一定在跑；401 会触发 app 的登出逻辑把 token 清掉、进而跳回登录页。
// 所以把接口打桩成空数组（Home 只读不写，空数组不影响光标层渲染）。
// 注意：必须用 pathname 精确匹配根路径的 /api/ —— 用 '**/api/**' 会把应用自己的
// 源码模块 /src/api/*.ts 一起拦截，模块图被替换成 []，页面直接渲染成空白。
await ctx.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`${APP}/home`, { waitUntil: 'domcontentloaded' });

// 采样入场动画期间 .sp-page-enter 的 computed transform：
// 若它非 none，则该元素会成为 position:fixed 后代的包含块（这才是「坐标偏移」的真凶）；
// 动画结束后（无 fill-mode）应为 none。
const anim = [];
for (let i = 0; i < 10; i++) {
  const t = await page.evaluate(() => {
    const el = document.querySelector('.sp-page-enter');
    return el ? getComputedStyle(el).transform : '(未挂载)';
  });
  anim.push(`${i * 60}ms:${t}`);
  await page.waitForTimeout(60);
}
console.log('  .sp-page-enter transform 采样 → ' + anim.join('  '));
try {
  await page.waitForSelector('.sp-home-crosshair', { timeout: 15000 });
} catch (e) {
  const diag = await page.evaluate(() => ({
    url: location.href,
    hash: location.hash,
    rootHtml: (document.getElementById('root')?.innerHTML ?? '').slice(0, 600),
    bodyText: (document.body.innerText ?? '').slice(0, 300),
    ls: Object.fromEntries(Object.entries(localStorage)),
  }));
  console.log('  !! 没等到 .sp-home-crosshair，诊断如下：');
  console.log('  url =', diag.url);
  console.log('  localStorage =', JSON.stringify(diag.ls));
  console.log('  body 文本 =', JSON.stringify(diag.bodyText));
  console.log('  root HTML =', diag.rootHtml);
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1200); // 等入场动画跑完（0.3s）+ 稳定

// 确认 zoom 真的生效
const zoom = await page.evaluate(() => ({
  bodyZoom: document.body.style.zoom,
  computed: getComputedStyle(document.body).zoom,
  varZoom: getComputedStyle(document.documentElement).getPropertyValue('--sp-zoom').trim(),
}));
console.log(`\n=== 字体缩放 = ${SCALE} ===`);
console.log(`  body.style.zoom=${zoom.bodyZoom}  计算值=${zoom.computed}  --sp-zoom=${zoom.varZoom}`);

// 取一张快捷卡片的中心（现在只有卡片和侧边栏会被框住）
const btn = await page.evaluate(() => {
  const b = document.querySelector('.sp-quick-card');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { rect: [r.left, r.top, r.width, r.height], cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled: false };
});
if (!btn) { console.log('  !! 找不到 A+ 按钮'); await browser.close(); process.exit(1); }
console.log(`  A+ 按钮 矩形=[${btn.rect.map((n) => n.toFixed(1)).join(', ')}]  disabled=${btn.disabled}`);

// 把"鼠标"移到按钮上，触发 document 的 mousemove
await page.mouse.move(btn.cx, btn.cy);
await page.waitForTimeout(250);

// 找出十字框跟随层：position:fixed + z-index 9999 + pointer-events:none
const cursor = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => {
    const s = getComputedStyle(d);
    return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    rect: [r.left, r.top, r.width, r.height],
    transform: el.style.transform,
    parentChain: (() => {
      const out = [];
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        const s = getComputedStyle(p);
        out.push(`${p.tagName.toLowerCase()}.${(p.className || '').toString().split(' ')[0] || '-'} [pos=${s.position} transform=${s.transform} zoom=${s.zoom}]`);
        p = p.parentElement;
      }
      return out;
    })(),
  };
});
if (!cursor) { console.log('  !! 找不到十字框层'); await browser.close(); process.exit(1); }

console.log(`  框内联 transform=${cursor.transform}`);
console.log(`  框实际画出 矩形=[${cursor.rect.map((n) => n.toFixed(1)).join(', ')}]`);
console.log(`  期望（应等于按钮矩形）=[${btn.rect.map((n) => n.toFixed(1)).join(', ')}]`);
const dx = cursor.rect[0] - btn.rect[0];
const dy = cursor.rect[1] - btn.rect[1];
console.log(`  偏差 dx=${dx.toFixed(1)}  dy=${dy.toFixed(1)}`);
console.log('  祖先链:');
for (const c of cursor.parentChain) console.log('    ' + c);

await browser.close();
