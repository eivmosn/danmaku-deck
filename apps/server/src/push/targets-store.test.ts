import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PushTargetsStore } from './targets-store'

function makeStore(): { store: PushTargetsStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-targets-'))
  return { store: new PushTargetsStore({ dir }), dir }
}

describe('PushTargetsStore', () => {
  it('保存后能按平台取出完整地址', () => {
    const { store } = makeStore()
    store.set('bilibili', { server: 'rtmp://push.example.com/live', key: 'secret-key' })

    expect(store.get('bilibili')).toEqual({
      platform: 'bilibili',
      server: 'rtmp://push.example.com/live',
      key: 'secret-key',
    })
    expect(store.get('xiaohongshu')).toBeNull()
  })

  it('快照接口不回显密钥', () => {
    const { store } = makeStore()
    store.set('xiaohongshu', { server: 'rtmp://x/live', key: 'top-secret' })

    const snapshot = store.snapshot()
    expect(JSON.stringify(snapshot)).not.toContain('top-secret')
    expect(snapshot[0]).toMatchObject({ platform: 'xiaohongshu', hasKey: true })
  })

  it('清除后回到未配置状态', () => {
    const { store, dir } = makeStore()
    store.set('bilibili', { server: 'rtmp://x', key: 'k' })
    store.clear('bilibili')

    expect(store.get('bilibili')).toBeNull()
    expect(readFileSync(join(dir, 'push-targets.json'), 'utf8')).toContain('{}')
  })
})
