# Free API Check-in

一个用于**公益大模型 API 网站自动签到**的可扩展项目骨架。

当前版本先提供通用框架，不包含真实站点的签到实现。目标是后续逐步接入多个公益站点，并通过 GitHub Actions 每天自动执行签到。

## Features

- 支持多个站点的统一签到入口
- 通过 provider 机制扩展/删除站点
- 支持按环境变量启用指定站点
- 支持 `--dry-run` 干跑模式
- 适配 GitHub Actions 每日定时执行
- 已提供一个无副作用的示例 provider

## Tech Stack

- Node.js 20+
- TypeScript
- GitHub Actions

## Project Structure

```text
.
├─ .github/
│  └─ workflows/
│     └─ daily-checkin.yml
├─ src/
│  ├─ core/
│  │  ├─ config.ts
│  │  ├─ runner.ts
│  │  └─ types.ts
│  ├─ providers/
│  │  ├─ example.ts
│  │  └─ index.ts
│  └─ index.ts
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ README.md
├─ README_EN.md
└─ CLAUDE.md
```

## How It Works

1. 从环境变量读取启用的 provider 列表
2. 从注册表加载可用 provider
3. 过滤出需要执行的 provider
4. 检查每个 provider 所需环境变量是否存在
5. 顺序执行 provider
6. 输出汇总结果，若有失败则返回非零退出码

核心入口见：`src/index.ts`

## Configuration

参考 `.env.example`：

```env
CHECKIN_ENABLED=example
CHECKIN_DRY_RUN=false
```

说明：

- `CHECKIN_ENABLED`：逗号分隔的 provider ID 列表
- `CHECKIN_DRY_RUN`：是否启用全局 dry-run

后续新增真实站点时，可继续添加：

```env
SITE_A_COOKIE=
SITE_A_TOKEN=
```

## Local Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run in dry-run mode

```bash
CHECKIN_ENABLED=example npm run checkin:dry
```

### Run normally

```bash
CHECKIN_ENABLED=example npm run checkin
```

## Add a New Provider

1. 在 `src/providers/` 下新增一个 provider 文件
2. 实现 `CheckInProvider` 接口
3. 在 `src/providers/index.ts` 中注册
4. 为该 provider 增加所需环境变量
5. 在 GitHub Actions secrets 中配置对应值

示例接口定义见：`src/core/types.ts`

## GitHub Actions

工作流文件：`.github/workflows/daily-checkin.yml`

当前支持：
- 手动触发 `workflow_dispatch`
- 每日定时执行 `schedule`

你需要在 GitHub 仓库中配置对应的 Secrets，例如：

- `CHECKIN_ENABLED`
- `CHECKIN_DRY_RUN`
- 未来各站点专属变量，如 `SITE_A_COOKIE`

## Current Status

当前仓库只完成了框架搭建：

- 已有统一调度逻辑
- 已有 provider 注册机制
- 已有示例 provider
- 尚未接入任何真实公益站点

## Roadmap

- 接入第一个真实公益站点
- 支持 Cookie / Token / 页面按钮等不同签到方式
- 视需要引入浏览器自动化
- 增加更细的日志和错误分类

## Notes

本项目仅用于你本人授权范围内的自动签到流程。
接入真实站点时，应遵守对应网站的使用条款与访问频率限制。
