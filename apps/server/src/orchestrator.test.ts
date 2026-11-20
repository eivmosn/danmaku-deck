import { describe, expect, it } from 'vitest'
import { Orchestrator } from '@/orchestrator'

const fixedClock = (): number => 1_700_000_000_000

describe('Orchestrator', () => {
  it('收流开始进入 live 并记录流路径', () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    orchestrator.streamStarted('ps5')

    const snapshot = orchestrator.snapshot()
    expect(snapshot.state).toBe('live')
    expect(snapshot.streamPath).toBe('ps5')
    expect(snapshot.uptimeSeconds).toBe(0)
  })

  it('收流结束后回到 idle 并清空路径', () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    orchestrator.streamStarted('ps5')
    orchestrator.streamStopped()

    const snapshot = orchestrator.snapshot()
    expect(snapshot.state).toBe('idle')
    expect(snapshot.streamPath).toBeNull()
  })

  it('重复的开始/结束事件是幂等的', () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    orchestrator.streamStarted('ps5')
    orchestrator.streamStarted('ps5')
    expect(orchestrator.snapshot().state).toBe('live')

    orchestrator.streamStopped()
    orchestrator.streamStopped()
    expect(orchestrator.snapshot().state).toBe('idle')
  })

  it('状态变化会通知订阅者，且可退订', () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    const states: string[] = []
    const unsubscribe = orchestrator.onStatus((status) => states.push(status.state))

    orchestrator.streamStarted('ps5')
    expect(states).toEqual(['starting', 'live'])

    unsubscribe()
    orchestrator.streamStopped()
    expect(states).toEqual(['starting', 'live'])
  })

  it('平台状态可更新并出现在快照里', () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    orchestrator.setPlatform('bilibili', { enabled: true, accountName: '丘野' })

    const bilibili = orchestrator.snapshot().platforms.find((item) => item.platform === 'bilibili')
    expect(bilibili?.enabled).toBe(true)
    expect(bilibili?.accountName).toBe('丘野')
  })
})
