<p align="center">
  <img src="./ReHoYo_Logo_Transparent.png" alt="ReHoYo" width="260" />
</p>

<h1 align="center">ReHoYo 全球游戏版本区域发行 Agent</h1>

<p align="center">
  从版本 Brief、真实区域研究到发行方案与 AI 角色沙盒执行。<br />
  让全球游戏发行从“看报告”走向“有证据地做决定”。
</p>

> **概念演示 · 非官方产品**
>
> ReHoYo 不内置或补造玩家评论。产品中的玩家证据必须来自本次真实公开网页检索，保留 HTTPS URL、原始摘录、来源与检索时间。缺少证据的区域会明确降级为 Brief 驱动方案，不会被描述为当地玩家偏好。

## 产品路径

ReHoYo 的主流程只保留四个阶段：

1. **输入新版本内容**：提交游戏、版本、上线日期、发行目标、核心卖点、资产、预算和风险边界。
2. **Agent 针对区域进行分析**：研究中国、日本、北美及英语市场的公开讨论，并对每个判断保留证据链。
3. **Agent 给出发行方案**：生成统一全球主轴、三地差异化策略、42 天节奏和可审核发行动作。
4. **AI 角色执行自己的方案**：在本地受控沙盒中完成草稿、人工审批、启动、暂停、恢复与停止；不连接真实玩家，不发送外部消息。

界面采用白色、扁平、桌面端优先的渐进披露设计。主页面一次只呈现一个决策层；研究详情、动作解释、证据和执行日志按需展开。工作区内置折叠式发行助手，可解释区域策略、审批风险与证据缺口。

## 真实研究如何工作

社区研究 Agent 会为每次任务生成新的稳定轮换顺序，并按单一站点拆分查询，不再用一个大查询碰运气：

- 默认目标为 **30+ 个站点尝试**与 **30+ 条可核验玩家证据**。
- 同一研究任务会跨查询变体继续扩展，直到达到目标或用尽当前可用公开来源。
- 搜索组合使用 **Brave 公共搜索结果 + BigModel Web Search + 直接公开来源**。
- 不同任务使用不同 `runId` 旋转来源顺序，因此不会每次固定从同一批站点开始。
- 结果必须通过站点域名、游戏、版本别名、版本时间窗、玩家体验语义和 HTTPS 完整性校验。
- 达不到 30 条时只保留已验证结果，并把覆盖状态标记为“证据不足”；不会生成替代评论或假样本。

当前目录包含 37 个公开来源：

| 市场 | 公开来源 |
| --- | --- |
| 中国大陆 | Bilibili、米游社、百度贴吧、TapTap、NGA、知乎、17173、游民星空 |
| 日本 | Niconico、5ch、Yahoo!知恵袋、GameWith、note |
| 全球 / 北美 | HoYoPlay、HoYoLAB、YouTube、Reddit、Steam Community、Google Play、App Store、GameFAQs、ResetEra、Metacritic、X、Twitch |
| 中国台湾 / 韩国 | 巴哈姆特、PTT、Naver Cafe、DCInside、Inven |
| 欧洲 / 俄罗斯 / 拉美 | Jeuxvideo.com、MeinMMO、DTF、VK、3DJuegos、Vandal、Adrenaline |

补充边界：

- Reddit 通过对应游戏 Subreddit 的公开 Atom RSS 直接检索。
- Niconico 使用官方 Snapshot Search API；记录是公开视频页面元数据，不等同于读取完整评论区。
- HoYoPlay 只作为官方版本上下文，不混入玩家情绪样本。
- 页面数量代表本次成功检索并通过过滤的公开记录，不代表统计抽样或全部玩家。

### 无头网页观察、Wiki 与本地 RAG

检索命中后，Electron 主进程会继续完成以下真实处理链路：

1. Playwright 以 `headless: true` 启动 Chromium，在后台并行打开公开 HTTPS 页面并提取用户可见正文；运行页会实时显示“访问中 / 已提取 / 等待验证 / 失败”。
2. MediaWiki API 同时检索中英文 Wikipedia 与对应游戏 Wiki，补充角色、地点和版本背景。
3. 玩家页面与 Wiki 页面写入用户数据目录中的 `rehoyo-research.sqlite`，按约 900 字符切块建立本地检索索引。
4. 情绪、地区与策略 Agent 分别从本地 RAG 取回相关片段，再与带证据编号的玩家样本一同分析。

RAG 对资料角色做强隔离：`role=player` 才能支持玩家情绪、争议和策略；`role=context` 的 Wiki 只解释“玩家正在谈论的对象”，不会计入评论数、地区样本或情绪百分比。数据库保留在本机 Electron 用户数据目录，不上传到仓库。遇到验证码或 Turnstile 时页面会停在“等待验证”，程序不会绕过验证。

## 发行决策模型

版本 Brief 与玩家证据在领域模型中分开保存：

- `BriefFact`：团队明确输入的目标、卖点、资产和边界。
- `EvidenceRecord`：`synthetic: false`、HTTPS、原文摘录、地区、语言与检索时间。
- `DecisionTrace`：每个判断引用了哪些 Brief 字段和证据、置信度及限制。
- `RegionalReleasePlan`：中国、日本、北美及英语市场的目标、信号、机会、风险和建议渠道。
- `ReleaseAction`：素材、社媒、KOL、买量、联动、社区六类结构化动作。
- `PlanVersion`：草稿与批准版本历史；锁定动作不会被 Agent 自动覆盖。

高成本、低证据或高风险动作强制进入人工确认。方案不会预测具体 CPA、LTV、收入或未经验证的合作对象。

## AI 角色执行安全边界

角色发行只有在以下条件同时满足时才会解锁：

- Brief 明确允许角色关系发行预演；
- 当前区域存在可核验角色或剧情证据；
- 提供角色设定与审核模板；
- 风险偏好允许受控测试。

执行状态机为：

```text
生成待审草稿 → 人工批准 → 沙盒运行 → 暂停 / 恢复 / 停止
```

所有事件都标记 `sandbox: true`。领域模型没有玩家 ID、打开率、回复率或商业结果字段，因此演示不会把模拟互动包装成真实执行数据。

## 快速开始

建议使用 Node.js 24。

```bash
npm install
npm run dev
```

`npm install` 会通过 Playwright 安装与当前版本匹配的 Chromium，保证无头研究在新机器上可直接运行。浏览器只在后台执行公开网页观察，不会打开普通浏览器窗口。

`npm run dev` 会打开 **Electron 桌面窗口**，不会自动打开浏览器。只要本机尚未通过 App 保存有效连接，启动时就会显示全屏连接页，让用户输入 GLM API Key 与端点：

```text
https://open.bigmodel.cn/api/coding/paas/v4
```

API Key 由 Electron 主进程使用 `safeStorage` 通过 Windows DPAPI、macOS Keychain 或 Linux libsecret 加密保存。密钥不会进入渲染进程、`localStorage`、日志或 Git；安全存储不可用时只保存在主进程内存，不降级为明文。项目目录中的本地文件不会被隐式读取为连接配置；开发者如需外部注入，必须显式使用以下环境变量或启动参数。

开发环境也可使用仓库外部密钥文件：

```powershell
$env:REHOYO_GLM_API_KEY_FILE = "C:\secure\glm-api-key.txt"
$env:REHOYO_GLM_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4"
$env:REHOYO_GLM_MODEL = "glm-5.2"
npm run dev
```

## 常用命令

```bash
npm run dev           # Vite 渲染器 + Electron 桌面应用
npm start             # 生产构建后启动 Electron
npm run build         # TypeScript 与 Vite 生产构建
npm run test          # Vitest 单元与组件测试
npm run test:e2e      # 1440×900 / 1920×1080 浏览器渲染层验收
npm run test:electron # 真实 Electron 外壳、凭据与安全策略测试
npm run package       # 生成未安装应用目录
npm run dist          # 生成 Windows 安装程序
```

Playwright E2E 使用隔离的、明确命名的 HTTPS 测试夹具，不访问真实社区，也不会写入生产项目。当前验收覆盖：

- 四阶段完整路径与必填 Brief；
- 30 站点自适应搜索、双搜索引擎轮换与来源变序；
- 缺样本时不造数据的降级行为；
- 地区卡、主导航和执行控制无重叠；
- 角色草稿、批准、运行、暂停和停止；
- 常驻发行助手与证据回看；
- 键盘焦点、WCAG AA、控制台错误；
- Electron 首启凭据加密、重启恢复和外部导航拦截。

## 路由

Electron 正式环境使用 Hash Router：

| Hash 路径 | 页面 |
| --- | --- |
| `#/` | 发行项目大厅 |
| `#/projects/new` | 新版本 Brief |
| `#/projects/:projectId/analyze` | 真实区域研究 |
| `#/projects/:projectId/workspace?view=regions` | 区域分析 |
| `#/projects/:projectId/workspace?view=plan` | 发行方案 |
| `#/projects/:projectId/workspace?view=character` | AI 角色沙盒执行 |
| `#/projects/:projectId/workspace?view=evidence` | 证据与研究覆盖 |
| `#/legacy` | 旧版全球玩家洞察工作区 |

发行项目保存在版本化本地键 `rehoyo.release.v1`；损坏存储会自动清除，包含模拟证据或非 HTTPS 证据的项目会被拒绝。

## 项目结构

```text
electron/
├── main.mjs                 Electron 生命周期、安全 IPC 与研究任务
├── research-client.mjs      37 来源、自适应检索和 Agent 分析
├── research-client.d.mts    研究运行时类型契约
├── headless-research-browser.mjs  Playwright 后台页面观察与正文提取
├── wiki-context.mjs         Wikipedia / 游戏 Wiki 背景资料采集
├── local-rag-store.mjs      本地 SQLite 文档、分块与检索
├── glm-client.mjs           GLM 请求与流式顾问
└── connection-manager.mjs   OS 级加密凭据管理

src/
├── domain/
│   ├── release-project.ts   Brief、区域方案、动作与角色沙盒状态机
│   ├── release-storage.ts   版本化本地持久化与完整性检查
│   └── types.ts             真实研究事件与证据契约
├── features/
│   ├── projects/            项目大厅、Brief 与区域研究
│   └── release-workspace/   区域、方案、角色执行、证据与发行助手
├── App.tsx                  Hash 路由与项目恢复
└── styles.css               白色扁平视觉系统与响应式桌面布局

tests/
├── e2e/                     双桌面尺寸完整业务路径
└── electron/                Electron 外壳与安全边界
```

## 技术栈

Electron 43、React 19、TypeScript、Vite 8、Tailwind CSS v4、Motion、Radix Primitives、ECharts、Phosphor Icons、Streamdown、Vitest、Testing Library、Playwright 与 Axe。

界面使用 Noto Sans SC、Space Grotesk 和 IBM Plex Mono，仅支持宽度不低于 1280px 的桌面视口。正式产品不绕过登录、验证码、Turnstile、robots 规则或平台权限。
