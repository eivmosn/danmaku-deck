import { buildApp } from '@/app'
import { printBanner } from '@/banner'
import { loadConfig } from '@/config'
import { AccountsStore } from '@/accounts/store'
import { DanmakuBus } from '@/danmaku-bus'
import { describe, levelFor } from '@/danmaku-format'
import { createLogger, LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'
import { IrcServer } from '@/danmaku/irc-server'
import { BilibiliLive } from '@/platforms/bilibili/live'
import { XiaohongshuApi } from '@/platforms/xiaohongshu/api'
import { DnsServer } from '@/network/dns'
import { SniRelay } from '@/network/relay'
import { MihomoClient } from '@/network/mihomo'
import { PushService } from '@/push/push-service'
import { MediaMtxSync } from '@/services/mediamtx-sync'
import { SettingsStore } from '@/settings-store'
import { PushTargetsStore } from '@/push/targets-store'
import { DanmakuService } from '@/services/danmaku-service'

const config = loadConfig()
const logs = new LogService({ dir: process.env.PS5LB_LOG_DIR ?? 'logs' })
const orchestrator = new Orchestrator({ logger: createLogger(logs, '收流') })
const accounts = new AccountsStore()
const pushTargets = new PushTargetsStore()
const settings = new SettingsStore()
const bus = new DanmakuBus()
// 前端产物目录：容器/单文件部署时用环境变量指定
const webDir = process.env.PS5LB_WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname
const app = buildApp({
  orchestrator,
  logs,
  bus,
  accounts,
  pushTargets,
  settings,
  logger: config.logLevel !== 'fatal',
  webDir,
  mihomo: new MihomoClient({
    baseUrl: config.mihomoUrl,
    group: config.mihomoGroup,
  }),
  proxyConfig: {
    configPath: '/root/.config/mihomo/config.yaml',
    writePath: process.env.PS5LB_MIHOMO_CONF ?? './conf/mihomo.yaml',
  },
})

// 收到的弹幕 / 礼物写进日志（Web 的日志页与 JSONL 都能看到）
bus.subscribe((event) => {
  const scope = event.platform === 'bilibili' ? 'B站' : '小红书'
  logs.write(levelFor(event), scope, describe(event), { kind: event.kind, user: event.user })
})

const bilibiliLive = new BilibiliLive()
const xiaohongshuApi = new XiaohongshuApi()

// 重启后把登录态与开关恢复出来，界面不用重新点
for (const platform of ['bilibili', 'xiaohongshu'] as const) {
  const account = accounts.get(platform)
  orchestrator.setPlatform(platform, {
    enabled: settings.enabled(platform),
    accountName: account?.displayName ?? null,
  })
}
orchestrator.refresh()

// hook 只在瞬间触发，重启或丢事件时靠对账兜底
const mediamtxSync = new MediaMtxSync({
  orchestrator,
  onChange: (path, live) => {
    createLogger(logs, '收流').info(live ? '检测到推流（对账）' : '推流已结束（对账）', { path })
  },
})
mediamtxSync.start()

// 新的一场直播先把上一场的弹幕清掉
orchestrator.onStatus((status) => {
  if (status.state === 'starting' || (status.state === 'live' && status.uptimeSeconds === 0)) {
    bus.clear()
  }
})

const danmaku = new DanmakuService({
  orchestrator,
  accounts,
  pushTargets,
  bus,
  logs,
  xiaohongshu: xiaohongshuApi,
})
danmaku.start()

/** 自动调用 B 站开播接口（勾上开关就开播）；默认开启 */
const autoStartBilibili = process.env.PS5LB_AUTO_START_BILI !== '0'

/** 记录本场由我们开播的 B 站直播，停播时配对关掉 */
let bilibiliSession: { roomId: string; channel: 'electron' | 'livehime' } | null = null

function cookieOf(secret: Record<string, string>): string {
  return Object.entries(secret)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

const push = new PushService({
  orchestrator,
  accounts,
  logs,
  inputUrl: (path) => `rtmp://127.0.0.1:${config.rtmpPort}/${path}`,
  resolveTarget: async (platform) => {
    const configured = pushTargets.get(platform)
    if (configured) return configured

    if (platform === 'xiaohongshu') {
      const secret = accounts.secret('xiaohongshu')
      if (!secret?.cookie) return null
      const living = await xiaohongshuApi.livingPushUrl(secret.cookie)
      if (!living.ok || !living.data) {
        createLogger(logs, '小红书').warn(`取不到推流地址：${living.detail ?? '未开播'}`)
        return null
      }
      bilibiliSession = bilibiliSession ?? null
      return { platform: 'xiaohongshu', server: living.data.server, key: living.data.key }
    }

    if (platform !== 'bilibili' || !autoStartBilibili) return null

    const account = accounts.get('bilibili')
    const secret = accounts.secret('bilibili')
    if (!account || !secret) return null
    const started = await bilibiliLive.startLive({
      uid: account.externalId,
      cookie: cookieOf(secret),
      csrf: secret.bili_jct ?? '',
    })
    bilibiliSession = { roomId: account.externalId, channel: started.channel }
    createLogger(logs, 'B站').info('已调用开播接口')
    return started.target
  },
})
push.start()

// PS5 聊天窗口：连 irc.twitch.tv:IRC_PORT，收到的弹幕直接显示在屏幕
// 内置 TLS 中继：开着就能替代 twitch-relay 容器
let relay: SniRelay | null = null
if (config.relayEnabled) {
  relay = new SniRelay({
    port: config.relayPort,
    proxyDomains: ['twitch.tv', 'live-video.net', 'twitchcdn.net'],
    proxy: { host: config.proxyHost, port: config.proxyPort },
    onRoute: (host, viaProxy) => {
      createLogger(logs, '代理').debug(`中继 ${host}`, { viaProxy })
    },
  })
  try {
    await relay.listen()
    createLogger(logs, '系统').info('TLS 中继已启动', { port: config.relayPort })
  } catch (error) {
    createLogger(logs, '系统').error('TLS 中继启动失败', {
      reason: error instanceof Error ? error.message : String(error),
    })
    relay = null
  }
}

// 内置 DNS：默认关闭，开着就能替代 dnsmasq 容器
let dns: DnsServer | null = null
if (config.dnsEnabled) {
  dns = new DnsServer({
    port: config.dnsPort,
    address: config.dnsHost,
    hijackDomains: ['twitch.tv', 'live-video.net'],
    hijackIp: config.dnsHijackIp,
  })
  try {
    await dns.listen()
    createLogger(logs, '系统').info('DNS 劫持已启动', {
      port: config.dnsPort,
      ip: config.dnsHijackIp,
    })
  } catch (error) {
    createLogger(logs, '系统').error('DNS 启动失败', {
      reason: error instanceof Error ? error.message : String(error),
    })
    dns = null
  }
}

const irc = new IrcServer({ port: config.ircPort })
try {
  await irc.listen()
  createLogger(logs, '系统').info('聊天通道已监听', { port: config.ircPort })
} catch (error) {
  createLogger(logs, '系统').error('聊天通道启动失败', {
    port: config.ircPort,
    reason: error instanceof Error ? error.message : String(error),
  })
}
bus.subscribe((event) => irc.broadcast(event))

// 停播时把 B 站那边也关掉，避免留下空直播间
let wasLive = false
orchestrator.onStatus((status) => {
  const live = status.state === 'live'
  if (wasLive && !live && bilibiliSession) {
    const account = accounts.get('bilibili')
    const secret = accounts.secret('bilibili')
    if (account && secret) {
      void bilibiliLive
        .stopLive({
          roomId: bilibiliSession.roomId,
          cookie: cookieOf(secret),
          csrf: secret.bili_jct ?? '',
          channel: bilibiliSession.channel,
        })
        .then(() => createLogger(logs, 'B站').info('已调用关播接口'))
        .catch((error: unknown) =>
          createLogger(logs, 'B站').error('关播失败', {
            reason: error instanceof Error ? error.message : String(error),
          }),
        )
    }
    bilibiliSession = null
  }
  wasLive = live
})

await printBanner({
  version: process.env.PS5LB_VERSION ?? '0.0.1',
  host: config.host,
  port: config.port,
  mode: process.env.NODE_ENV ?? 'development',
})

await app.listen({ host: config.host, port: config.port })
createLogger(logs, '系统').info('服务已启动', { host: config.host, port: config.port })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, '准备退出')
  mediamtxSync.stop()
  danmaku.stop()
  push.stop()
  await irc.close()
  dns?.close()
  await relay?.close()
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
