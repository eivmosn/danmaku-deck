import { buildApp } from '@/app'
import { printBanner } from '@/banner'
import { loadConfig } from '@/config'
import { AccountsStore } from '@/accounts/store'
import { DanmakuBus } from '@/danmaku-bus'
import { describe, levelFor } from '@/danmaku-format'
import { createLogger, LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'
import { IrcServer } from '@/danmaku/irc-server'
import { PushService } from '@/push/push-service'
import { PushTargetsStore } from '@/push/targets-store'
import { DanmakuService } from '@/services/danmaku-service'

const config = loadConfig()
const logs = new LogService({ dir: process.env.PS5LB_LOG_DIR ?? 'logs' })
const orchestrator = new Orchestrator({ logger: createLogger(logs, '收流') })
const accounts = new AccountsStore()
const pushTargets = new PushTargetsStore()
const bus = new DanmakuBus()
const webDir = new URL('../../web/dist', import.meta.url).pathname
const app = buildApp({
  orchestrator,
  logs,
  bus,
  accounts,
  pushTargets,
  logger: config.logLevel !== 'fatal',
  webDir,
})

// 收到的弹幕 / 礼物写进日志（Web 的日志页与 JSONL 都能看到）
bus.subscribe((event) => {
  const scope = event.platform === 'bilibili' ? 'B站' : '小红书'
  logs.write(levelFor(event), scope, describe(event), { kind: event.kind, user: event.user })
})

const danmaku = new DanmakuService({ orchestrator, accounts, bus, logs })
danmaku.start()

const push = new PushService({
  orchestrator,
  accounts,
  logs,
  inputUrl: (path) => `rtmp://127.0.0.1:${config.rtmpPort}/${path}`,
  resolveTarget: async (platform) => pushTargets.get(platform),
})
push.start()

// PS5 聊天窗口：连 irc.twitch.tv:IRC_PORT，收到的弹幕直接显示在屏幕
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
  danmaku.stop()
  push.stop()
  await irc.close()
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
