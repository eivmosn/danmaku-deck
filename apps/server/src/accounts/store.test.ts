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
  it('登录后能取到账号，凭证加密落盘', () => {
    const { store, dir } = makeStore()
    store.signIn({
      platform: 'bilibili',
      displayName: '示例主播',
      externalId: '10010001',
      secret: { SESSDATA: 'secret-value' },
    })

    expect(store.get('bilibili')?.displayName).toBe('示例主播')
    expect(store.secret('bilibili')).toEqual({ SESSDATA: 'secret-value' })

    const raw = readFileSync(join(dir, 'accounts.json'), 'utf8')
    expect(raw).not.toContain('secret-value')
  })

  it('再次登录会覆盖同一平台的账号（换号语义）', () => {
    const { store } = makeStore()
    store.signIn({
      platform: 'xiaohongshu',
      displayName: '旧账号',
      externalId: 'old',
      secret: { cookie: 'a1=1' },
    })
    store.signIn({
      platform: 'xiaohongshu',
      displayName: '新账号',
      externalId: 'new',
      secret: { cookie: 'a1=2' },
    })

    expect(store.get('xiaohongshu')?.displayName).toBe('新账号')
    expect(store.secret('xiaohongshu')).toEqual({ cookie: 'a1=2' })
    expect(store.snapshot().filter(Boolean)).toHaveLength(1)
  })

  it('退出登录会清掉账号与凭证', () => {
    const { store } = makeStore()
    store.signIn({
      platform: 'bilibili',
      displayName: '测试',
      externalId: '1',
      secret: { SESSDATA: 'abc' },
    })

    expect(store.signOut('bilibili')).toBe(true)
    expect(store.get('bilibili')).toBeNull()
    expect(store.secret('bilibili')).toBeNull()
    expect(store.signOut('bilibili')).toBe(false)
  })

  it('两个平台互不影响', () => {
    const { store } = makeStore()
    store.signIn({
      platform: 'bilibili',
      displayName: 'B 站号',
      externalId: '1',
      secret: { SESSDATA: 'abc' },
    })
    expect(store.get('xiaohongshu')).toBeNull()
    expect(store.snapshot().filter(Boolean)).toHaveLength(1)
  })
})
