# Global Launch Commander

《崩坏：星穹铁道》多语种 AI 全球发行作战指挥官。

面对 42 天版本周期，Global Launch Commander 同时观察中文、英文和日文公开社区，识别跨文化风险，推演玩家反应，并在突发事件发生时生成可由发行人员批准的行动方案。

## MVP 范围

- 一款游戏：《崩坏：星穹铁道》
- 三种语言：中文、英文、日文
- 一个上线前内容预演
- 一个历史事件回放
- 300 条以内公开评论
- 三种决策方案：观察、轻度响应、正式处置
- 一个人类批准入口；不会向真实外部平台发布内容

## 核心 Agent

1. **全球舆情扫描 Agent**：合并多语言事件，追踪热度、情绪、来源与传播平台。
2. **跨文化风险 Agent**：检查文案、翻译、角色表达与视觉元素在不同地区的理解差异。
3. **玩家影响推演 Agent**：模拟玩家圈层、传播路径和不同响应方案的后果。所有结果必须标注“AI 推演，不代表真实预测”。
4. **发行决策 Agent**：整合证据并生成观察、轻度响应和正式处置三套方案，最终由人类批准。

## 产品流程

```text
发布前预演 → 全球上线 → 发现异常 → 推演影响 → 生成决策 → 人类批准 → 继续观察
```

## 技术栈

- Vue 3
- TypeScript
- Vite
- Cloudflare Workers Static Assets
- npm（锁文件：`package-lock.json`）

## 本地开发

项目目前只包含仓库与工程基础配置，页面源码将在后续阶段加入。

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run dev          # 启动 Vite 开发服务器
npm run typecheck    # 运行 Vue / TypeScript 类型检查
npm run build        # 类型检查并生成 dist
npm run preview      # 本地预览生产构建
npm run cf:dev       # 使用 Wrangler 预览 dist
npm run deploy       # 部署到 Cloudflare Workers
```

## Cloudflare 部署

`wrangler.toml` 将 `dist/` 配置为 SPA 静态资源目录。完成页面源码后：

```bash
npm run build
npx wrangler login
npm run deploy
```

部署不会连接真实社交平台，也不会自动发布公告。

## 内容与合规说明

本项目是用于产品演示的原型。评论流和事件案例应使用公开来源或虚构数据，并保留证据链接、置信度和反对证据。最终发行决定始终由人类负责。
