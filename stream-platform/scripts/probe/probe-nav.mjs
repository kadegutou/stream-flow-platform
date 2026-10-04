/**
 * 验证「应用内路由切换」不再触发 hooks 数量变化导致的 React 崩溃。
 * 场景：/jobs（SiderCrosshair 渲染，调用 hook）→ 点侧边栏「首页」→ isHome 变 true。
 * 若 useFontScaleStore 放在 early return 之后，这里会抛
 * "Rendered fewer hooks than expected"。
 */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('stream_platform_token', 'probe-fake-token');
  localStorage.setItem('stream_platform_nickname', '探针');
  localStorage.setItem('stream_platform_role', 'ADMIN');
  localStorage.setItem('sp-font-scale', '1.3');
});
await ctx.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

const page = await ctx.newPage();
const errors = [];   // 只关心 React 不变量违规（hooks 数量变化会抛 "Rendered fewer hooks than expected"）
const noise = [];    // 其余 console error 单独列出，不计入判定（antd 的 deprecation 告警属既有噪声）
const isReactInvariant = (t) => /hooks|Rendered|Minified React error/i.test(t);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  (isReactInvariant(t) ? errors : noise).push(t);
});

await page.goto('http://localhost:5173/jobs', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sp-sider-item', { timeout: 15000 });
await page.waitForTimeout(800);

// 点侧边栏「首页」——应用内导航，SiderCrosshair 的 isHome 由 false 变 true
await page.getByRole('button', { name: /首页/ }).first().click();
await page.waitForTimeout(1500);

const state = await page.evaluate(() => ({
  url: location.href,
  homeMounted: !!document.querySelector('.sp-home-crosshair'),
  rootEmpty: (document.getElementById('root')?.innerHTML ?? '').length === 0,
}));

console.log('\n=== 应用内导航 /jobs → /home（缩放 1.3，hooks 数量会变） ===');
console.log(`  URL          = ${state.url}`);
console.log(`  首页已挂载   = ${state.homeMounted}`);
console.log(`  root 空白    = ${state.rootEmpty}`);
console.log(`  React 错误   = ${errors.length ? JSON.stringify(errors, null, 2) : '无'}`);
console.log(`  其他 console = ${noise.length ? noise.length + ' 条（既有噪声，与本次无关）' : '无'}`);
for (const n of noise) console.log('      · ' + n.slice(0, 90));
console.log(errors.length === 0 && state.homeMounted ? '\n  ✓ 通过：无 React hooks 错误，首页正常挂载' : '\n  ✗ 失败');

await browser.close();
