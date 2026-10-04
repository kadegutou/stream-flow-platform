/**
 * 实测十字框在「两种主题 × 侧边栏/首页卡片」四种组合下的实际线色，
 * 并按实际底色算 WCAG 对比度，确认浅色模式下侧边栏不再是「隐形框」。
 */
import { chromium } from 'playwright-core';

/** 相对亮度（WCAG） */
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** 半透明前景压在底色上的合成色 */
const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const probe = async (dark, targetSel, label, bgName, bg) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([d]) => {
    localStorage.setItem('stream_platform_token', 'probe');
    localStorage.setItem('stream_platform_role', 'ADMIN');
    localStorage.setItem('stream_platform_font_scale', '1');
    localStorage.setItem('sp-font-scale', '1');
    localStorage.setItem('sp-theme-dark', d);
  }, [dark ? '1' : '0']);
  await ctx.route((u) => u.pathname.startsWith('/api/'),
    (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
  await page.waitForTimeout(1400);

  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, targetSel);
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(400);

  const line = await page.evaluate(() => {
    const layer = [...document.querySelectorAll('div')].find((d) => {
      const s = getComputedStyle(d);
      return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
    });
    if (!layer) return null;
    const corner = layer.querySelector('span');
    const s = getComputedStyle(corner);
    return { color: s.borderTopColor, opacity: getComputedStyle(layer).opacity };
  });
  await ctx.close();
  if (!line) { console.log(`  ${label.padEnd(22)} 没抓到框`); return; }

  const f = parse(line.color);
  const composited = over(f.rgb, f.a, bg);
  const c = ratio(composited, bg);
  const tag = c >= 3 ? '✓ 可见' : '✗ 看不见';
  console.log(`  ${label.padEnd(22)} 线色=${line.color.padEnd(24)} 压在 ${bgName} 上 → 合成 rgb(${composited.join(',')})  对比度 ${c.toFixed(2)}:1  ${tag}`);
};

console.log('\n=== 十字框线色与对比度实测 ===');
for (const [dark, name] of [[false, '浅色主题'], [true, '深色主题']]) {
  console.log(`\n【${name}】`);
  // 侧边栏底色：brandDeepGradient 两套调色板都是 #141e30→#243b55，取中段偏暗的 #141e30 做基准
  await probe(dark, '.sp-sider-item', '侧边栏菜单条', '#141e30（侧边栏恒深）', [0x14, 0x1e, 0x30]);
  const cardBg = dark ? [0x0d, 0x18, 0x22] : [0xff, 0xff, 0xff];
  await probe(dark, '.sp-quick-card', '首页快捷卡片', dark ? '#0d1822（深色卡）' : '#ffffff（白色卡）', cardBg);
}
await browser.close();
