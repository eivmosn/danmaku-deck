# PS5 Live Bridge · 架构设计（v0.1 草案）

> 目标：把现在散落在 NAS 上的 5 个容器、1 个 iOS App、若干脚本，收敛成一套**可开源、可维护、支持多账号**的产品。

---

## 1. 现状盘点

### 1.1 运行中的容器

| 容器           | 镜像                         | 职责                                                                                | 谁维护   |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `ps5lb`        | `icenoproblem/ps5livebridge` | 收 PS5 RTMP(1935)、转推 B 站、Twitch IRC 服务(6666)、Web 面板(5000)、本地 FLV(8098) | 第三方   |
| `ps5lb-dns`    | `dockurr/dnsmasq`            | 把 twitch 域名劫持到 NAS                                                            | 通用镜像 |
| `mihomo`       | `metacubex/mihomo`           | 代理节点，Twitch 出海(7890/9090)                                                    | 第三方   |
| `xhs-bridge`   | 自建                         | 小红书推流 + 弹幕、B 站互动监听、IRC 合并代理(6667)、HTTP API(5099)                 | **我们** |
| `twitch-relay` | 自建                         | PS5 的 Twitch HTTPS 中继(18443)，配合 iptables 重定向                               | **我们** |

### 1.2 当前链路

```
PS5 ──DNS(劫持)──> NAS:53
  ├─ contribute.live-video.net:1935 ──> ps5lb 收流 ──> 转推 B 站
  ├─ irc.twitch.tv:6667 ──> xhs-bridge 代理 ──> ps5lb IRC(6666) ──> PS5 屏幕
  └─ *.twitch.tv:443 ──iptables──> twitch-relay(18443) ──> mihomo ──> 公网
```

### 1.3 现存问题

| 问题                        | 影响                             |
| --------------------------- | -------------------------------- |
| 5 个容器各自为政            | 升级、排障、迁移都要动 5 处      |
| B 站账号锁死在 ps5lb 容器里 | **无法切换账号**（当前最大约束） |
| 面板在 ps5lb 里，改不了     | 我们的 App 只能读它的 API        |
| 自建逻辑是散装 mjs          | 无类型、无测试、无版本           |
| 无统一配置与日志            | 出问题靠 SSH 逐个看              |

---

## 2. 目标架构

### 2.1 容器从 5 个收敛到 3 个

```
┌─────────────────────────────────────────────────────────┐
│  bridge（我们的 Node/TS 服务，单容器）                     │
│  ├─ HTTP API + WebSocket（App / Web 面板）                │
│  ├─ 平台适配层（B 站 / 小红书）                            │
│  ├─ 弹幕聚合 + IRC 服务（替代 ps5lb 的 6666）              │
│  ├─ DNS 服务（替代 dnsmasq 容器）                          │
│  ├─ 443 SNI 中继（替代 twitch-relay 容器）                 │
│  └─ 推流编排（ffmpeg 子进程）                              │
├─────────────────────────────────────────────────────────┤
│  mediamtx（收流，替代 ps5lb 的 1935）                      │
├─────────────────────────────────────────────────────────┤
│  mihomo（代理引擎，保留）                                  │
└─────────────────────────────────────────────────────────┘
```

- **ps5lb 退役**：它的三件事（收流 / 转推 B 站 / IRC）我们全部自己实现。
  - 收流 → `mediamtx`（单二进制、镜像 ~20MB）
  - 转推 B 站 → 我们已有 cookie 与接口（`FetchWebUsrInfo`），自己推
  - IRC → 我们已经在写（当前是代理，改成服务端）
- 收益：容器 5→3，账号不再锁在第三方镜像里，**可以做账号切换**。

### 2.2 服务端内部模块

```
apps/server/src/
  http/          # Fastify 路由、SSE、WebSocket
  orchestrator/  # 直播状态机：idle → starting → live → stopping
  platforms/
    bilibili/    # 登录、推流地址、弹幕 WS、互动事件、标题分区封面
    xiaohongshu/ # cookie、开播码换地址、弹幕（catbus 或自研）
  push/          # ffmpeg 编排、多路输出
  danmaku/       # 事件聚合、节流、IRC 服务
  network/       # DNS 劫持、443 中继、mihomo 管理
  accounts/      # 多账号存储与切换
  config/        # zod schema + 迁移
```

### 2.3 状态机（替代现在的 tick 轮询）

```
idle ──检测到 PS5 推流──> starting ──推流就绪──> live ──PS5 停流──> stopping ──> idle
```

用事件驱动（mediamtx 的 HTTP API 回调 / webhook）替代 2 秒轮询，空闲时零请求。

---

## 3. 多账号设计

### 3.1 数据模型

```ts
type Platform = 'bilibili' | 'xiaohongshu'

interface Account {
  id: string // uuid
  platform: Platform
  displayName: string // 昵称
  externalId: string // uid / 小红书 id
  credentials: EncryptedBlob
  createdAt: string
  lastUsedAt?: string
}
```

### 3.2 切换语义

- `POST /api/accounts/:platform/:id/activate`
- 只允许**空闲时**切换（直播中返回 409，避免推流中断）
- 切换后：重建该平台的弹幕连接、刷新推流凭证、广播状态

### 3.3 凭证存储

- 文件 `~/.ps5lb/credentials.json`，权限 `0600`
- 用 `AES-256-GCM` 加密，主密钥在 `~/.ps5lb/master.key`（`0600`，首次启动生成）
- API 永不返回明文，只返回「已配置/有效期」

> 注意：当前 B 站 cookie 由 ps5lb 持有，我们拿不到写入权。这也是要退役 ps5lb 的原因之一。

---

## 4. 前端

### 4.1 Web 面板（新增）

- **Vite + React 19 + TypeScript**
- 组件：`coss.com/ui` 风格（基于 Base UI），源码自有、可改
- 状态：**Zustand**
- 样式：**Tailwind CSS v4**（coss 的组件依赖 Tailwind，不用 UnoCSS）
- 质量：**oxlint** + **oxfmt** + **vitest** + `tsc --noEmit`
- 提交钩子：**simple-git-hooks** + **nano-staged**（只检查暂存文件，跑 oxlint + oxfmt）
- 打包：`vite build`，产物由 server 静态托管

### 4.2 App（iOS，保留）

- 现有 SwiftUI 工程继续用，改为对接新 server 的 API（接口兼容层）
- 后续可考虑 Swift 端也接 WebSocket 推送，替代轮询

---

## 5. 仓库结构

```
ps5-live-bridge/
├── apps/
│   ├── server/          # Fastify + TS
│   └── web/             # Vite + React + TS
├── packages/
│   ├── shared/          # zod schema、DTO、常量
│   ├── platform-bilibili/
│   ├── platform-xiaohongshu/
│   ├── danmaku/         # 聚合 + IRC
│   └── network/         # DNS + 中继 + mihomo 控制
├── docker/
│   ├── compose.yml
│   └── Dockerfile.server
├── docs/
│   ├── architecture.md
│   ├── deploy-nas.md
│   └── platforms.md
├── .github/workflows/ci.yml
├── oxlint.json
├── vitest.config.ts
├── pnpm-workspace.yaml
└── README.md
```

---

## 6. 开源规划

| 项       | 决定                                                                |
| -------- | ------------------------------------------------------------------- |
| 许可证   | MIT                                                                 |
| 包管理   | pnpm workspace                                                      |
| 代码质量 | oxlint（correctness/suspicious/perf）+ vitest + tsc                 |
| 版本     | Changesets                                                          |
| CI       | oxlint + vitest + tsc + docker build                                |
| 发布     | GHCR 镜像（`ghcr.io/<org>/ps5-live-bridge`）                        |
| 文档     | 架构 / NAS 部署 / 平台配置 / 常见问题                               |
| 合规     | README 明确「仅限自己账号、遵守平台条款」，不提供任何绕过风控的能力 |

**不做的事**：不内置任何账号池、不提供破解/去重/规避审核功能、不代注册。

---

## 7. 迁移路线

| 阶段   | 内容                                           | 产出                          |
| ------ | ---------------------------------------------- | ----------------------------- |
| **P0** | 仓库骨架、lint/test/CI、compose                | `pnpm lint && pnpm test` 能跑 |
| **P1** | server 基础：配置、状态、HTTP/WS、健康检查     | App 能连上新 server           |
| **P2** | 弹幕：B 站 WS + 小红书 + IRC 服务              | PS5 屏幕收两边弹幕            |
| **P3** | 推流：mediamtx 收流 + ffmpeg 编排 + 双平台推流 | 替代 ps5lb                    |
| **P4** | 网络：DNS + 443 中继 + mihomo 管理             | 替代 dnsmasq / twitch-relay   |
| **P5** | Web 面板                                       | 浏览器可配                    |
| **P6** | 多账号 + 打包发布                              | 可开源                        |

---

## 8. 需要你拍板的三个点

1. **是否退役 ps5lb**（自研收流 + B 站推流）
   - 是 → 能做账号切换、容器减到 3 个；代价是 B 站那套接口要自己维护
   - 否 → 账号切换做不了，ps5lb 只能单账号
2. **收流用 mediamtx 还是 node-media-server**
   - mediamtx：成熟、性能好、单二进制（推荐）
   - node-media-server：纯 Node 生态统一，但性能和维护一般
3. **Web 面板的 UI 框架**
   - React（团队熟、生态大）还是 Vue（你低代码项目用的）
