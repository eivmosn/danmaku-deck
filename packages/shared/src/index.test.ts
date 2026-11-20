import { describe, expect, it } from 'vitest'
import { danmakuEventSchema, statusSchema } from './index'

describe('statusSchema', () => {
  it('接受完整状态', () => {
    const parsed = statusSchema.parse({
      state: 'live',
      uptimeSeconds: 12,
      platforms: [
        { platform: 'bilibili', enabled: true, accountName: '丘野', live: true, error: null },
      ],
      streamPath: 'ps5',
      updatedAt: new Date().toISOString(),
    })
    expect(parsed.state).toBe('live')
    expect(parsed.platforms).toHaveLength(1)
    expect(parsed.streamPath).toBe('ps5')
  })

  it('拒绝非法状态机取值', () => {
    const result = statusSchema.safeParse({
      state: 'paused',
      uptimeSeconds: 0,
      platforms: [],
      updatedAt: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('danmakuEventSchema', () => {
  it('缺省 count 为 0', () => {
    const parsed = danmakuEventSchema.parse({
      platform: 'xiaohongshu',
      kind: 'chat',
      user: '观众乙',
      text: '来了',
      at: '2026-11-20T10:00:00Z',
    })
    expect(parsed.count).toBe(0)
  })
})
