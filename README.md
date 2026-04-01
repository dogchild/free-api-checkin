# Free API Check-in

一个用于**公益大模型 API 网站自动签到**的项目。

目前已经支持：

- `ice.v.ua`
- `elysiver.h-e.top`

## GitHub 自动任务使用方式

1. Fork 或克隆本仓库到你自己的 GitHub 仓库。
2. 在仓库的 **Settings -> Secrets and variables -> Actions** 中配置运行所需的 Secrets。
3. 在 GitHub Actions 中启用工作流。
4. 等待每日自动执行，或手动触发一次验证。

当前工作流文件：

- `.github/workflows/daily-checkin.yml`

当前默认定时执行时间为：

- **北京时间每天 00:30**

### 需要配置的 Secrets

公共变量：

- `CHECKIN_ENABLED`：填写要启用的网站 ID，可用值如 `ice`、`elysiver`，或 `ice,elysiver`

`ice.v.ua` 相关：

- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`

`elysiver.h-e.top` 相关：

- `ELYSIVER_COOKIE`
- `ELYSIVER_USER_ID`

说明：

- 只启用哪个网站，就只需要填写那个网站对应的变量。
- 如果同时启用多个网站，就需要把对应变量都配好。
- 这些登录材料目前仍需要你自己从浏览器中获取，并在失效后手动更新。

## 当前情况

- 项目已经可以在 GitHub Actions 中自动执行
- 已经接入两个真实公益网站
- 不同网站使用的登录材料不同，因此需要分别配置对应 Secrets

## Future Plan

未来会继续接入更多公益网站，并逐步完善自动签到的稳定性与可维护性。

## Notes

本项目仅用于你本人授权范围内的自动签到流程。
接入真实站点时，请遵守对应网站的使用条款与访问频率限制。
