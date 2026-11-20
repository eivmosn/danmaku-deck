import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DanmakuEvent } from '@danmaku-deck/shared'
import { describe, expect, it, vi } from 'vitest'
import { AccountsStore } from '@/accounts/store'
import { DanmakuBus } from '@/danmaku-bus'
import { LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'
import { PushTargetsStore } from '@/push/targets-store'
import { DanmakuService, type DanmakuClientPort } from './danmaku-service'

const fixedClock = (): number => 1_700_000_000_000

function setup(withAccount = true) {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-ds-'))
  const accounts = new AccountsStore({ dir })
  if (withAccount) {
    accounts.signIn({
      platform: 'bilibili',
      displayName: '示例主播',
      externalId: '10010001',
      secret: { SESSDATA: 'abc', bili_jct: 'def' },
    })
  }

  const pushTargets = new PushTargetsStore({ dir })
  const orchestrator = new Orchestrator({ now: fixedClock })
  const logs = new LogService({ console: false, now: fixedClock })
  const bus = new DanmakuBus()

  const connect = vi.fn(async () => {})
  const stop = vi.fn()
  const createClient = vi.fn<
    (
      platform: 'bilibili' | 'xiaohongshu',
      input: { cookie: string; roomId: string },
      onEvent: (event: DanmakuEvent) => void,
    ) => DanmakuClientPort
  >(() => ({ connect, stop }))

  const service = new DanmakuService({
    orchestrator,
    accounts,
    pushTargets,
    bus,
    logs,
    createClient,
    resolveRoomId: async () => '10010001',
  })
  return { service, orchestrator, accounts, logs, bus, createClient, connect, stop }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('DanmakuService', () => {
  it('开播且平台开启时建立连接', async () => {
    const { service, orchestrator, createClient, connect } = setup()
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()

    orchestrator.streamStarted('ps5')
    await tick()

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('平台关闭时不连接', async () => {
    const { service, orchestrator, createClient } = setup()
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    expect(createClient).not.toHaveBeenCalled()
    service.stop()
  })

  it('没有账号时不连接', async () => {
    const { service, orchestrator, createClient } = setup(false)
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    expect(createClient).not.toHaveBeenCalled()
    service.stop()
  })

  it('停播时断开连接', async () => {
    const { service, orchestrator, stop, connect } = setup()
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()

    orchestrator.streamStopped()
    await tick()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('连接失败会写错误日志且不重复连接', async () => {
    const { service, orchestrator, logs, createClient } = setup()
    createClient.mockImplementation(() => ({
      connect: async () => {
        throw new Error('弹幕服务器连接失败')
      },
      stop: () => {},
    }))
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    const messages = logs.recent().map((entry) => entry.message)
    expect(messages.some((message) => message.includes('弹幕连接失败'))).toBe(true)
    service.stop()
  })
})

describe('DanmakuService 小红书', () => {
  it('有推流地址时按房间号连接', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps5lb-ds2-'))
    const accounts = new AccountsStore({ dir })
    accounts.signIn({
      platform: 'xiaohongshu',
      displayName: '小红书账号',
      externalId: '',
      secret: { cookie: 'a1=x' },
    })
    const pushTargets = new PushTargetsStore({ dir })
    pushTargets.set('xiaohongshu', { server: 'rtmp://x/', key: '700000000000000001?txSecret=abc' })

    const orchestrator = new Orchestrator({ now: fixedClock })
    const logs = new LogService({ console: false, now: fixedClock })
    const connect = vi.fn(async () => {})
    const createClient = vi.fn(() => ({ connect, stop: vi.fn() }))
    const service = new DanmakuService({
      orchestrator,
      accounts,
      pushTargets,
      bus: new DanmakuBus(),
      logs,
      createClient,
    })

    orchestrator.setPlatform('xiaohongshu', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()

    expect(createClient).toHaveBeenCalledWith(
      'xiaohongshu',
      expect.objectContaining({ roomId: '700000000000000001' }),
      expect.any(Function),
    )
    service.stop()
  })

  it('没有本场推流地址时给出提示不连接', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps5lb-ds3-'))
    const accounts = new AccountsStore({ dir })
    accounts.signIn({
      platform: 'xiaohongshu',
      displayName: '小红书账号',
      externalId: '',
      secret: { cookie: 'a1=x' },
    })
    const orchestrator = new Orchestrator({ now: fixedClock })
    const logs = new LogService({ console: false, now: fixedClock })
    const createClient = vi.fn(() => ({ connect: vi.fn(async () => {}), stop: vi.fn() }))
    const service = new DanmakuService({
      orchestrator,
      accounts,
      pushTargets: new PushTargetsStore({ dir }),
      bus: new DanmakuBus(),
      logs,
      createClient,
    })

    orchestrator.setPlatform('xiaohongshu', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()

    expect(createClient).not.toHaveBeenCalled()
    expect(logs.recent().some((entry) => entry.message.includes('先兑换开播码'))).toBe(true)
    service.stop()
  })
})
