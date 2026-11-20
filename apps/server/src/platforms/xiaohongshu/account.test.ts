import { describe, expect, it } from 'vitest'
import { fetchXhsProfile, parseStatus } from './account'

/** 输出结构来自容器里 catbus 的真实返回 */
const statusOutput =
  '{"ok":true,"platform":"xhs","endpoint":"web","resource":"auth","action":"status","account":null,"data":{"logged_in":true,"user":{"name":"示例观众","id":"6384be02"},"method":"cookie","expires_at":null},"page":null,"error":null}'

describe('parseStatus', () => {
  it('取出昵称与 id', () => {
    expect(parseStatus(statusOutput)).toEqual({ name: '示例观众', id: '6384be02' })
  })

  it('未登录返回 null', () => {
    expect(parseStatus('{"data":{"logged_in":false,"user":null}}')).toBeNull()
  })

  it('非 JSON 输出返回 null', () => {
    expect(parseStatus('boom')).toBeNull()
  })
})

const failingRunner = async (): Promise<string> => {
  throw new Error('boom')
}

describe('fetchXhsProfile', () => {
  it('先登录再查状态', async () => {
    const calls: string[][] = []
    const runner = async (args: string[]): Promise<string> => {
      calls.push(args)
      return args.includes('status') ? statusOutput : '{"ok":true}'
    }

    const profile = await fetchXhsProfile('a1=x; web_session=y', runner)
    expect(profile).toEqual({ name: '示例观众', id: '6384be02' })
    expect(calls[0]).toContain('login')
    expect(calls[1]).toContain('status')
  })

  it('catbus 报错时返回 null', async () => {
    expect(await fetchXhsProfile('a1=x', failingRunner)).toBeNull()
  })
})
