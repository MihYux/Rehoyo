<p align="center">
  <img src="./ReHoYo_Logo_Transparent.png" alt="ReHoYo" width="260" />
</p>

<h1 align="center">ReHoYo 全球玩家洞察指挥中心</h1>

<p align="center">
  由多个专业 AI Agent 组成的全球游戏玩家研究团队。<br />
  在下一次版本发布前，帮助开发与运营团队理解全球玩家真正关心什么。
</p>

> **概念演示 · 非官方产品**
>
> 当前版本是 Electron 桌面端高保真 Demo。所有评论、数量、事件与洞察均为确定性模拟数据快照；应用不会访问实时互联网，也不代表任何游戏或平台的真实结论。

## 产品概览

ReHoYo 将传统的“查看最终 AI 总结”变成可观察的多 Agent 研究流程。用户可以创建一次全球玩家分析任务，并实时查看四名 Agent 如何采集证据、分析情绪、比较地区差异并生成版本策略。

- **社区研究 Agent**：整理 Reddit、YouTube、Bilibili、米游社、HoYoLAB 与应用商店等公开来源的模拟讨论快照。
- **玩家情绪 Agent**：识别正面、负面与中性观点，并追踪情绪背后的具体成因。
- **地区差异 Agent**：比较中国、日本和欧美玩家的关注重点、语言差异与文化语境。
- **策略建议 Agent**：综合上游证据，输出版本内容、宣传、本地化和风险控制建议。

## 主要体验

- 选择《原神》《崩坏：星穹铁道》《绝区零》的预设版本，或创建自定义分析任务。
- 观察约 35–45 秒的确定性 Agent 协作过程。
- 在 DevTools 风格 Timeline 中回看事件、风险、交接与证据到达过程。
- 点击任意 Agent 检查任务目标、来源、数据量、中间发现与输出。
- 在研究 Dashboard 中查看情绪趋势、地区矩阵、热门关键词、争议和优先级建议。
- 使用地区与来源筛选器联动更新观点和证据。
- 向 AI 游戏顾问提问，并通过证据编号返回报告中的原始模拟观点。
- 将完成的任务保存在本机，重启应用后继续查看报告。

## 内置演示案例

| 游戏 | 版本 | 更新名称 |
| --- | --- | --- |
| 原神 | 5.0 | 荣花与炎日之途 |
| 崩坏：星穹铁道 | 2.0 | 假如在午夜入梦 |
| 绝区零 | 1.1 | 卧底蓝调 |

三个案例共享统一的领域模型与任务引擎，但拥有独立的证据、事件、地区洞察、争议和顾问回答。自定义游戏会使用醒目标记的通用演示模板。

## 技术栈

- Electron 43（安全隔离主进程与预加载桥接）
- React 19、TypeScript、Vite 8
- Tailwind CSS v4、Motion、Radix Primitives
- Apache ECharts、Phosphor Icons
- Vitest、Testing Library、Playwright、Axe

界面使用 Noto Sans SC、Space Grotesk 与 IBM Plex Mono，并采用仅面向 `1280px` 以上桌面视口的 Operational Product 视觉系统。

## 快速开始

建议使用 Node.js 22 LTS。

```bash
npm install
npm run dev
```

`npm run dev` 会启动本地渲染服务并自动打开 **ReHoYo Electron 桌面窗口**。Vite 不会打开浏览器，也不应把终端中的本地渲染地址作为产品入口。应用不需要 API Key、后端服务或外部账号。

常用命令：

```bash
npm start          # 构建后直接运行桌面应用
npm run package    # 生成未安装的 Windows 应用目录
npm run dist       # 生成 Windows 安装程序
npm run test       # 单元与组件测试
npm run test:e2e   # 渲染层关键路径测试
npm run test:electron # Electron 窗口、安全策略与预加载测试
npm run check      # 单元测试与生产构建
```

`npm run dev:renderer` 仅用于渲染层隔离开发和自动化测试；它不会自动打开浏览器，也不是日常产品启动方式。

## 桌面安全边界

- 渲染层启用 `contextIsolation`、Chromium sandbox 与 Web Security。
- 禁止渲染层直接访问 Node.js。
- 新窗口与外部导航默认拒绝，不会从应用中拉起浏览器。
- 预加载层只暴露只读的运行平台信息。
- 正式运行通过 `file://` 加载本机构建产物；开发模式仅连接 `127.0.0.1`。

## 测试

首次运行渲染层浏览器测试前安装 Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

Electron 测试直接启动打包前的桌面窗口，不需要浏览器：

```bash
npm run test:electron
```

Playwright 会在 `1440×900` 和 `1920×1080` 两种桌面尺寸下验证完整流程，并通过内部测试时钟缩短等待。测试覆盖任务创建、Agent 状态依赖、检查器、Timeline、报告筛选、顾问解锁、证据回跳、键盘焦点、WCAG A/AA 审计与控制台错误。

## 路由

Electron 正式环境使用 Hash Router，使本地 `file://` 加载与刷新保持稳定。

| Hash 路径 | 页面 |
| --- | --- |
| `#/` | 任务大厅与最近任务 |
| `#/tasks/:taskId/run` | Agent 实时工作区 |
| `#/tasks/:taskId/report?tab=overview` | 全球洞察报告 |
| `#/tasks/:taskId/report?tab=regions` | 地区差异 |
| `#/tasks/:taskId/report?tab=controversies` | 争议与证据 |
| `#/tasks/:taskId/report?tab=strategy` | 策略建议 |
| `#/tasks/:taskId/advisor` | 证据型 AI 游戏顾问 |

未完成任务无法直接访问报告或顾问。运行中的页面刷新后会从头开始；已完成报告可从本地历史恢复。

## 项目结构

```text
electron/
├── main.mjs              Electron 生命周期、窗口与导航策略
├── preload.cjs           最小化、只读的安全桥接
└── config.mjs            可测试的桌面窗口安全配置

src/
├── components/           品牌与共享界面组件
├── data/                 三个确定性演示案例
├── desktop/              Electron 配置契约测试
├── domain/               类型、任务引擎、顾问匹配与本地存储
├── features/
│   ├── lobby/            任务大厅
│   ├── workspace/        Agent 工作区与 Timeline
│   ├── report/           洞察 Dashboard
│   └── advisor/          证据型 AI 顾问
├── App.tsx               Hash 路由、任务会话与恢复逻辑
└── styles.css            设计 Token 与全局界面样式

tests/
├── e2e/                  渲染层桌面关键路径
├── electron/             Electron 窗口与安全边界
└── setup.ts              Vitest 测试环境
```

## 数据与状态模型

所有可见数字、图表、Agent 状态和顾问引用都来自同一组 `AnalysisEvent` 与 `EvidenceRecord`。演示证据统一带有 `synthetic: true` 标记，避免造成实时爬虫或真实玩家数据的误解。

```text
待机 → 采集 → 分类 → 地区比较 → 策略综合 → 完成
```

社区研究 Agent 首先启动；情绪与地区 Agent 在证据充足后重叠工作；策略 Agent 等待上游交接后综合报告。完成任务使用版本化键 `rehoyo.demo.v1` 写入本地存储，损坏数据会被安全清除。

## 当前范围

当前 Demo 不包含真实爬虫、模型 API、登录权限、多人协作、移动端适配、PDF 导出或官方游戏素材。领域层与界面层已经分离，未来可通过替换数据和任务适配层接入后端服务，而无需重做主要产品流程。
