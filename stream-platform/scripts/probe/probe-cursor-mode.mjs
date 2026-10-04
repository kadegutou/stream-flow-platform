/**
 * 验证「常态普通光标 / 只在卡片与侧边栏上出十字框」。
 *
 * 每一处都同时检查两件事：
 *   ① 鼠标下那个元素的 computed cursor —— 必须是 none 才说明"系统光标已隐藏"，
 *      否则说明"框画了、光标还在"（两者不一致）
 *   ② 十字框层是否可见（opacity > 0.5）
 * 期望：只有「卡片」和「侧边栏菜单条」两处是 (none, 可见)，其余全是 (非 none, 不可见)。
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function run(page, url, probes) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
  await page.waitForTimeout(1200);

  console.log(`\n=== ${url.replace('http://localhost:5173', '')} ===`);
  for (const p of probes) {
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' }); // 目标可能在首屏之外，elementFromPoint 会返回 null
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, p.sel);
    if (!box) { console.log(`  ${p.name.padEnd(16)} —— 找不到 ${p.sel}`); continue; }

    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(250);

    const r = await page.evaluate(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      const cursor = hit ? getComputedStyle(hit).cursor : '(null)';
      const layer = [...document.querySelectorAll('div')].find((d) => {
        const s = getComputedStyle(d);
        return s.position === 'fixed' && s.zIndex === '9999' && s.pointerEvents === 'none';
      });
      return { cursor, opacity: layer ? +getComputedStyle(layer).opacity : 0, hit: hit?.tagName + '.' + (hit?.className || '').toString().split(' ')[0] };
    }, [box.x, box.y]);

    const frameVisible = r.opacity > 0.5;
    const cursorHidden = r.cursor === 'none';
    const ok = p.expect
      ? (cursorHidden === p.expect.frame && frameVisible === p.expect.frame)
      : (!cursorHidden && !frameVisible);
    console.log(
      `  ${ok ? '✓' : '✗'} ${p.name.padEnd(16)} cursor=${r.cursor.padEnd(10)} 框可见=${String(frameVisible).padEnd(5)} 命中=${r.hit}`,
    );
  }
}

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

const CARD = { sel: '.sp-quick-card', name: '快捷卡片', expect: { frame: true } };
const SIDER = { sel: '.sp-sider-item', name: '侧边栏菜单条', expect: { frame: true } };
const BTN = { sel: 'button[title="放大字体"]', name: '顶部按钮 A+', expect: { frame: false } };
const NODE = { sel: 'svg[viewBox="0 0 900 320"] circle', name: '拓扑节点', expect: { frame: false } };
// 内容区容器 —— 非目标区域（首页与 /jobs 都有）
const BLANK = { sel: 'main.ant-layout-content', name: '内容区空白处', expect: { frame: false } };

await run(page, 'http://localhost:5173/home', [CARD, SIDER, BTN, NODE, BLANK]);
await run(page, 'http://localhost:5173/jobs', [SIDER, BLANK]);

await browser.close();
