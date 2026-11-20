# Danmaku Deck

把 PS5 的原生直播画面推到 B 站 / 小红书，并把两边的弹幕、礼物、进场事件汇成一路送回 PS5 屏幕。

> 当前状态：已在 NAS 上跑起来了（Docker 三容器：服务端 + MediaMTX + mihomo），
> B 站推流与弹幕、小红书推流与弹幕、PS5 屏幕弹幕、DNS 劫持、TLS 中继都已实机验证。

## 它解决什么

PS5 只能推到 Twitch，没有采集卡就没法播 B 站/小红书。这套东西把 PS5 的 Twitch 流量接管下来：

```
PS5 ──DNS 劫持──> NAS ──┬──> MediaMTX 收流 ──> ffmpeg 分发到 B 站 / 小红书
                        ├──> IRC 服务：两边弹幕送回 PS5 屏幕
                        └──> TLS 中继：Twitch 鉴权经代理出海
```

好处：不用采集卡、不用电脑常开，NAS 24 小时在跑就够。

## 结构

```
apps/
  server/   Fastify + TypeScript，编排直播状态、平台适配、推流与弹幕
  web/      Vite + React 19 + Tailwind v4 + Base UI（coss 风格），配置面板
packages/
  shared/   zod schema 与跨端类型
docs/
  architecture.md  完整架构设计与迁移路线
```

## 开发

```sh
pnpm install
pnpm dev          # 同时起 server(8787) 与 web(5173)
pnpm check        # lint + typecheck + test + build
```

单独跑：

```sh
pnpm --filter @danmaku-deck/server dev
pnpm --filter @danmaku-deck/web dev
pnpm test
pnpm format       # oxfmt 格式化
```

## 接口

| 方法 | 路径          | 说明                           |
| ---- | ------------- | ------------------------------ |
| GET  | `/api/health` | 健康检查                       |
| GET  | `/api/status` | 直播状态与平台开关（zod 校验） |

## 约定

- TypeScript 严格模式，`noUncheckedIndexedAccess` 打开
- 跨目录导入统一用 `@/` 别名（已配 tsconfig paths + vite/vitest/tsdown 别名），同目录内部才用相对路径
- 前端组件放 `apps/web/src/components/ui/`，采用 coss 的「源码自有」方式，不引入黑盒组件库
- 提交前由 simple-git-hooks + nano-staged 自动跑 oxlint + oxfmt（只处理暂存文件）

## 许可

MIT
