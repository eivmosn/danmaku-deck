import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DanmakuEvent } from '@ps5lb/shared'
import { describe, expect, it, vi } from 'vitest'
import { AccountsStore } from '@/accounts/store'
import { DanmakuBus } from '@/danmaku-bus'
import { LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'
import { DanmakuService, type DanmakuClientPort } from './danmaku-service'

const fixedClock = (): number => 1_700_000_000_000

function setup(withAccount = true) {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-ds-'))
  const accounts = new AccountsStore({ dir })
  if (withAccount) {
    accounts.add({
      platform: 'bilibili',
      displayName: '丘野Pixel',
      externalId: '31455973',
      secret: { SESSDATA: 'abc', bili_jct: 'def' },
    })
  }

  const orchestrator = new Orchestrator({ now: fixedClock })
  const logs = new LogService({ console: false, now: fixedClock })
  const bus = new DanmakuBus()

  const connect = vi.fn(async () => {})
  const stop = vi.fn()
  const createClient = vi.fn<
    (cookie: string, onEvent: (event: DanmakuEvent) => void) => DanmakuClientPort
  >(() => ({ connect, stop }))

  const service = new DanmakuService({ orchestrator, accounts, bus, logs, createClient })
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
