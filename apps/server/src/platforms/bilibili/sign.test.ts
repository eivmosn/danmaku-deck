import { describe, expect, it } from 'vitest'
import { ELECTRON_BUILD, signApp, signElectron, urlencode } from './sign'

/**
 * 参考值由 ps5lb 的 Python 实现（/app/core/bili.py 的 _electronsign）算出，
 * 用来保证 TS 移植后签名逐字节一致。
 */
describe('签名', () => {
  it('Electron 开播参数签名与 Python 实现一致', () => {
    const signed = signElectron({
      room_id: 10010001,
      platform: 'web_electron_link',
      area_v2: '236',
      csrf: 'deadbeef',
      csrf_token: 'deadbeef',
      build: ELECTRON_BUILD,
      ts: 1700000000,
    })

    expect(signed.sign).toBe('6096f7ca2479eecf8328881b0c5a82e4')
  })

  it('APP 签名与 Python 实现一致', () => {
    const signed = signApp({ system_version: 2, ts: 1700000000 })
    expect(signed.sign).toBe('a98e8814240417bed555873f3892c131')
  })

  it('参数按 key 排序，空格编码成 +（与 urlencode 一致）', () => {
    expect(urlencode({ b: 'hello world', a: 1 })).toBe('a=1&b=hello+world')
  })

  it('特殊字符按 RFC 3986 编码', () => {
    expect(urlencode({ note: "it's ok" })).toBe('note=it%27s+ok')
  })
})
