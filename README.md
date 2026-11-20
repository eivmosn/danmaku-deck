# PS5 Live Bridge

把 PS5 的原生直播画面推到 B 站 / 小红书，并把两边的弹幕、礼物、进场事件汇成一路送回 PS5 屏幕。

> 当前状态：**架构重写中**。仓库里是 P0 骨架（可运行、可测试），旧服务仍在 NAS 上跑着，暂不迁移。

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
pnpm --filter @ps5lb/server dev
pnpm --filter @ps5lb/web dev
pnpm test
```

## 接口

| 方法 | 路径          | 说明                           |
| ---- | ------------- | ------------------------------ |
| GET  | `/api/health` | 健康检查                       |
| GET  | `/api/status` | 直播状态与平台开关（zod 校验） |

## 约定

- TypeScript 严格模式，`noUncheckedIndexedAccess` 打开
- 服务端 ESM（NodeNext），相对导入必须带 `.js`
- 前端组件放 `apps/web/src/components/ui/`，采用 coss 的「源码自有」方式，不引入黑盒组件库
- 提交前自动跑 oxlint + nano-staged

## 许可

MIT
