import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountsStore } from './store'

function makeStore(): { store: AccountsStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-accounts-'))
  return { store: new AccountsStore({ dir }), dir }
}

describe('AccountsStore', () => {
  it('新增账号后可以列出，凭证加密落盘', () => {
    const { store, dir } = makeStore()
    const account = store.add({
      platform: 'bilibili',
      displayName: '丘野Pixel',
      externalId: '31455973',
      secret: { sessdata: 'abc123', biliJct: 'xyz' },
    })

    expect(store.list()).toHaveLength(1)
    expect(store.active('bilibili')?.displayName).toBe('丘野Pixel')
    expect(store.secret(account.id)).toEqual({ sessdata: 'abc123', biliJct: 'xyz' })

    const raw = readFileSync(join(dir, 'accounts.json'), 'utf8')
    expect(raw).not.toContain('abc123')
    expect(raw).toContain('.')
  })

  it('切换账号只更新最近使用时间', () => {
    const { store } = makeStore()
    const first = store.add({
      platform: 'xiaohongshu',
      displayName: '一口吃掉甜心',
      externalId: '6384be02',
      secret: { cookie: 'a1=1' },
    })
    const second = store.add({
      platform: 'xiaohongshu',
      displayName: '小号',
      externalId: 'aaaa',
      secret: { cookie: 'a1=2' },
    })

    expect(store.active('xiaohongshu')?.id).toBe(second.id)
    const activated = store.activate('xiaohongshu', first.id)
    expect(activated?.id).toBe(first.id)
    expect(store.list()).toHaveLength(2)
  })

  it('删除账号会同时清掉凭证', () => {
    const { store } = makeStore()
    const account = store.add({
      platform: 'bilibili',
      displayName: '测试',
      externalId: '1',
      secret: { sessdata: 'abc' },
    })

    expect(store.remove(account.id)).toBe(true)
    expect(store.list()).toHaveLength(0)
    expect(store.secret(account.id)).toBeNull()
  })

  it('平台隔离：拿不到另一个平台的激活账号', () => {
    const { store } = makeStore()
    store.add({
      platform: 'bilibili',
      displayName: 'B 站号',
      externalId: '1',
      secret: { sessdata: 'abc' },
    })
    expect(store.active('xiaohongshu')).toBeNull()
  })
})
