# 前端交互探针（probe）

用**真实 Chrome** 驱动页面、直接量 DOM 几何与计算样式，把「看起来对不对」变成「数值是多少」。
本项目这几类坑都是靠它定位和回归的：十字框在字体缩放下偏移、拓扑节点重叠、提示文字被裁、
侧边栏 hover 的横向滚动条、光标常态……

不依赖后端：所有 `/api/**` 请求都被打桩成空数组，登录态用 localStorage 伪造。

## 准备

```bash
cd stream-platform/scripts/probe
npm i                     # 只装 playwright-core，不下载浏览器
# 另开一个终端，在前端目录起 dev server
cd ../../frontend && npm run dev      # http://localhost:5173
```

用系统已装的 Chrome（`channel: 'chrome'`），不额外下浏览器。**未装 Chrome 的机器跑不了。**

## 探针清单

### 回归用（改了相关代码就跑一遍）

| 探针 | 验什么 | 期望 |
|---|---|---|
| `probe-crosshair.mjs <scale>` | 十字框定位 + `÷zoom` 换算 | 偏差恒为 −4/−4（设计 GAP=4）；卡片 hover 上浮时 dy 再减去 3×scale |
| `probe-sider-hover.mjs` | 侧边栏 hover 位移 + 十字框逐帧跟随 | 条目 `translateX(4px)`；过渡期间框偏差恒 −4/−4 |
| `probe-clamp.mjs` | 侧边栏目标的框是否被夹在栏内 | 框 = `[0, 200]`，不越过侧边栏右缘 |
| `probe-cursor-mode.mjs` | 光标常态与出框范围 | 卡片/侧边栏 `cursor:none` + 框可见；按钮/拓扑节点/空白处均为普通光标 |
| `probe-frame-color.mjs` | 框色对比度（WCAG 实算） | 侧边栏 9.8:1、卡片 5.7~10.4:1，均 ≥3:1 |
| `probe-topo-overlap.mjs [轮数]` | 拓扑节点是否重叠 | 硬重叠 0 次；最小圆心距 ≥88（= 2×32+24） |
| `probe-topo-label.mjs` | 标签是否出圈、提示文字与圆的几何间隙 | 标签不出圈；提示间隙为正（约 11px，改前是 **−5.7px 即重叠**） |
| `probe-nav.mjs` | 应用内 /jobs → /home 切换 | 无 React hooks 报错、首页正常挂载 |

### 取证用（排查特定问题时的一次性脚本）

| 探针 | 用途 |
|---|---|
| `probe-diff.mjs` | 悬停前/后像素级 diff（用来定位「白条到底是什么」） |
| `probe-whitebar.mjs` | 打印某点的 `elementsFromPoint` 图层栈 + nav 的 overflow 状态 |
| `probe-verify2.mjs` | nav 是否可横向滚动 + 提示文字是否落在 viewBox 内 |
| `probe-shot.mjs` | 截侧边栏与拓扑底部两张图到 `out/` |
| `probe-sider.mjs` | 非首页侧边栏框的位置（最早期的版本） |

## 注意

- **必须先起 dev server**（`localhost:5173`），否则探针连不上页面。
- 截图输出在 `scripts/probe/out/`（已 gitignore）。
- 这些探针断言的是**具体数值**（如 −4/−4、≥88、9.8:1）。若 UI 设计改动导致这些常量变化，
  同步改探针里的期望值，别直接判失败。
