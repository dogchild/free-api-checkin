# Free API Check-in

一个用于**公益大模型 API 网站自动签到**的可扩展 TypeScript 项目。

当前仓库已经包含：

- 通用 provider 框架
- 一个无副作用的 `example` provider
- 一个已接入的真实站点 provider：`ice.v.ua`

`ice.v.ua` 当前通过主站 `auth_token + user_id` 复用登录态，再走 `signv.ice.v.ua` 的嵌入式签到流程完成签到，不依赖浏览器自动化。

## Features

- 支持多个站点的统一签到入口
- 通过 provider 机制扩展/删除站点
- 支持用逗号分隔的环境变量启用多个 provider
- 支持可选的全局 `--dry-run` / `CHECKIN_DRY_RUN`
- 适配 GitHub Actions 手动与定时执行
- 已提供真实的 `ice.v.ua` 签到实现
- 将“签到成功”和“今日已签到”都视为成功结果

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
│  │  ├─ ice.ts
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
CHECKIN_ENABLED=ice
# CHECKIN_DRY_RUN=true
ICE_SUB2API_AUTH_TOKEN=
ICE_SUB2API_USER_ID=
```

说明：

- `CHECKIN_ENABLED`：逗号分隔的 provider ID 列表，例如 `ice` 或 `ice,site_a`
- `CHECKIN_DRY_RUN`：可选；未设置时默认 `false`，仅在显式设为 `true` 时启用 dry-run
- `ICE_SUB2API_AUTH_TOKEN`：从 `ice.v.ua` 登录后的浏览器 `localStorage.auth_token` 获取
- `ICE_SUB2API_USER_ID`：从 `auth_user.id` 或页面 iframe 中的 `user_id` 获取

说明：当前 `ice.v.ua` 方案依赖主站 `auth_token`，该值会过期。若用于 GitHub Actions，请在失效后手动更新对应 Secret。

## Local Development

### Install dependencies

```powershell
npm install
```

### Build

```powershell
npm run build
```

### Run `ice` in dry-run mode

```powershell
$env:CHECKIN_ENABLED="ice"
$env:CHECKIN_DRY_RUN="true"
$env:ICE_SUB2API_AUTH_TOKEN="dummy-token"
$env:ICE_SUB2API_USER_ID="6702"
npm run checkin
```

### Run `ice` normally

```powershell
$env:CHECKIN_ENABLED="ice"
$env:ICE_SUB2API_AUTH_TOKEN="your-auth-token"
$env:ICE_SUB2API_USER_ID="6702"
npm run checkin
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

当前定时配置为：**北京时间每天 00:30**。
由于 GitHub Actions 使用 UTC，工作流中的 cron 写法为前一天 `16:30 UTC`。

你至少需要在 GitHub 仓库中配置这些 Secrets：

- `CHECKIN_ENABLED`：例如 `ice`，或未来使用 `ice,site_a`
- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`

`CHECKIN_DRY_RUN` 不需要作为 GitHub 自动任务的常规 Secret。它更适合本地调试或手动验证时临时设置。

## Current Status

当前仓库已经不是纯骨架状态，而是：

- 已有统一调度逻辑
- 已有 provider 注册机制
- 已有 `example` provider
- 已有真实可用的 `ice.v.ua` provider
- 真实签到成功语义已验证

## Roadmap

- 接入更多真实公益站点
- 支持更多登录态复用方式
- 视需要引入浏览器自动化
- 增加更细的日志和错误分类
- 在未来评估更稳定的 token 更新策略

## Notes

本项目仅用于你本人授权范围内的自动签到流程。
接入真实站点时，应遵守对应网站的使用条款与访问频率限制。
