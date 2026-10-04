/**
 * 实测首页拓扑图的节点重叠情况。
 *
 * 判据（与源码常量一致）：
 *   NODE_R = 32, NODE_GAP = 16  →  圆心距 ≥ 80 才算「不重叠且留够间隙」
 *   圆心距 < 64  →  两个圆真的压在一起（硬重叠）
 *   圆心距 < 80  →  间隙不足（视觉上挨太近）
 * 另外记录节点实际渲染半径：悬停 35 / 选中 38，都比碰撞检测假设的 32 大。
 *
 * 用法：node scripts/probe/probe-topo-overlap.mjs [轮数]
 *   每轮重新加载页面并连续采样多次（节点会动态生成/消亡）。
 */
import { chromium } from 'playwright-core';

const ROUNDS = Number(process.argv[2] ?? 5);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const readNodes = () => {
  const svg = document.querySelector('svg[viewBox="0 0 900 320"]');
  if (!svg) return null;
  // r>10 才是节点球；边上的流动小点 r=3。
  // 同时读父 <g> 的 opacity —— 正在淡出的 dying 节点也在 DOM 里，必须区分开，
  // 否则会把「正在消失的节点」算成重叠。
  return [...svg.querySelectorAll('circle')]
    .filter((c) => +c.getAttribute('r') > 10)
    .map((c) => ({
      x: +c.getAttribute('cx'),
      y: +c.getAttribute('cy'),
      r: +c.getAttribute('r'),
      op: +(c.closest('g')?.getAttribute('opacity') ?? 1),
    }))
    .filter((n) => Number.isFinite(n.x));
};

let totalSamples = 0;
let hardOverlap = 0;   // 圆心距 < r1+r2   —— 两个球真的压住
let tightGap = 0;      // 圆心距 < 80 但 ≥ r1+r2 —— 间隙不足
let minSeen = Infinity;
let maxNodes = 0;      // 出现过的最大节点数
const counts = [];         // 每次采样的节点数
const conflictCounts = []; // 出现重叠时的节点数
const examples = [];

for (let round = 1; round <= ROUNDS; round++) {
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

  // 连续采样：节点每几秒会生成/消亡一次
  for (let t = 0; t < 24; t++) {
    const nodes = await page.evaluate(readNodes);
    if (nodes && nodes.length > 1) {
      totalSamples++;
      // 只统计「已完全显示」的节点（opacity ≥ 0.9）；淡出中的 dying 节点单独算
      const alive = nodes.filter((n) => n.op >= 0.9);
      maxNodes = Math.max(maxNodes, alive.length);
      let badHere = 0;
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const d = Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y);
          const rs = alive[i].r + alive[j].r;
          if (d < minSeen) minSeen = d;
          if (d < rs) {
            hardOverlap++;
            badHere++;
            if (examples.length < 6)
              examples.push(`第${round}轮 t=${(t * 0.5).toFixed(1)}s  存活节点=${alive.length}  圆心距=${d.toFixed(1)} < 半径和=${rs.toFixed(0)}`);
          } else if (d < 80) {
            tightGap++;
          }
        }
      }
      counts.push(alive.length);
      if (badHere > 0) { conflictCounts.push(alive.length); }
    }
    await page.waitForTimeout(500);
  }
  await ctx.close();
}

console.log(`\n=== 首页拓扑图重叠实测（${ROUNDS} 轮 × 每轮 12 秒，共 ${totalSamples} 次采样） ===`);
console.log(`  硬重叠（圆心距 < 两半径之和）： ${hardOverlap} 次`);
console.log(`  间隙不足（圆心距 < 80）：      ${tightGap} 次`);
console.log(`  实测出现过的最小圆心距：        ${minSeen === Infinity ? '—' : minSeen.toFixed(1)}`);
console.log(`  节点数范围：                    ${counts.length ? Math.min(...counts) + ' ~ ' + maxNodes : '—'}`);
if (conflictCounts.length) {
  const sorted = [...conflictCounts].sort((a, b) => a - b);
  console.log(`  出现重叠时的节点数：            ${sorted[0]} ~ ${sorted[sorted.length - 1]}（中位 ${sorted[Math.floor(sorted.length / 2)]}）`);
}
if (examples.length) {
  console.log('  硬重叠样例：');
  for (const e of examples) console.log('    · ' + e);
}
console.log(hardOverlap + tightGap > 0 ? '\n  ✗ 确认存在重叠/间距不足' : '\n  ✓ 本次采样未发现重叠');
await browser.close();
