import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Platform } from '@ps5lb/shared'
import { describe, expect, it, vi } from 'vitest'
import { AccountsStore } from '@/accounts/store'
import { LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'
import type { PushTarget } from './ffmpeg-pusher'
import { PushService, type PushProcessPort } from './push-service'

const fixedClock = (): number => 1_700_000_000_000
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function setup(options: { withAccounts?: boolean; target?: PushTarget | null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-push-'))
  const accounts = new AccountsStore({ dir })
  if (options.withAccounts !== false) {
    accounts.signIn({
      platform: 'bilibili',
      displayName: '丘野',
      externalId: '1',
      secret: { SESSDATA: 'x' },
    })
  }

  const orchestrator = new Orchestrator({ now: fixedClock })
  const logs = new LogService({ console: false, now: fixedClock })
  const target: PushTarget = options.target ?? {
    platform: 'bilibili',
    server: 'rtmp://push.example.com/live',
    key: 'stream-key',
  }

  const started: PushProcessPort[] = []
  const createPusher = (): PushProcessPort => {
    const pusher = { start: vi.fn(), stop: vi.fn(), running: true }
    started.push(pusher)
    return pusher
  }

  const resolveTarget = vi.fn(async (platform: Platform) =>
    options.target === null ? null : { ...target, platform },
  )

  const service = new PushService({
    orchestrator,
    accounts,
    logs,
    inputUrl: (path) => `rtmp://127.0.0.1:1935/${path}`,
    resolveTarget,
    createPusher,
  })

  return { service, orchestrator, logs, createPusher, resolveTarget, started }
}

describe('PushService', () => {
  it('开播且平台开启时启动推流', async () => {
    const { service, orchestrator, started } = setup()
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    expect(started).toHaveLength(1)
    expect(started[0]?.start).toHaveBeenCalled()
    service.stop()
  })

  it('停播时停止推流', async () => {
    const { service, orchestrator, started } = setup()
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    orchestrator.streamStopped()
    await tick()
    expect(started[0]?.stop).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('未登录时跳过并记录原因', async () => {
    const { service, orchestrator, logs, started } = setup({ withAccounts: false })
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    expect(started).toHaveLength(0)
    expect(logs.recent().some((entry) => entry.message.includes('未登录'))).toBe(true)
    service.stop()
  })

  it('拿不到推流地址时跳过', async () => {
    const { service, orchestrator, logs, started } = setup({ target: null })
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    expect(started).toHaveLength(0)
    expect(logs.recent().some((entry) => entry.message.includes('拿不到推流地址'))).toBe(true)
    service.stop()
  })

  it('解析失败记录错误日志', async () => {
    const { service, orchestrator, logs, resolveTarget } = setup()
    resolveTarget.mockRejectedValueOnce(new Error('接口 500'))
    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()

    expect(logs.recent().some((entry) => entry.message.includes('取推流地址失败：接口 500'))).toBe(
      true,
    )
    service.stop()
  })
})

describe('PushService 直播中登录', () => {
  it('开播后才登录，会补上推流（回归：只在状态变化时启动）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps5lb-push-login-'))
    const accounts = new AccountsStore({ dir })
    const orchestrator = new Orchestrator({ now: fixedClock })
    const logs = new LogService({ console: false, now: fixedClock })
    const started: PushProcessPort[] = []
    const service = new PushService({
      orchestrator,
      accounts,
      logs,
      inputUrl: (path) => `rtmp://127.0.0.1:1935/${path}`,
      resolveTarget: async (platform) => ({
        platform,
        server: 'rtmp://push/',
        key: 'k',
      }),
      createPusher: () => {
        const pusher = { start: vi.fn(), stop: vi.fn(), running: true }
        started.push(pusher)
        return pusher
      },
    })

    orchestrator.setPlatform('bilibili', { enabled: true })
    service.start()
    orchestrator.streamStarted('ps5')
    await tick()
    await tick()
    expect(started).toHaveLength(0) // 没登录，先不推

    accounts.signIn({
      platform: 'bilibili',
      displayName: '丘野',
      externalId: '1',
      secret: { SESSDATA: 'x' },
    })
    orchestrator.refresh() // 登录接口会调用它
    await tick()
    await tick()

    expect(started).toHaveLength(1)
    service.stop()
  })
})
