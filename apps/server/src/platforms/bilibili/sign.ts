import { createHash } from 'node:crypto'

/**
 * B 站直播姬的接口签名。
 *
 * 算法与 ps5lb（/app/core/bili.py 的 _appsign / _electronsign）一致：
 *   加 appkey → 按 key 排序 → urlencode → md5(query + secret) 十六进制
 *
 * urlencode 行为必须与 Python 的 urllib.parse.urlencode 对齐：
 * 空格编码成 +，其余按 RFC 3986 百分号编码。
 */

export const APP_KEY = 'aae92bc66f3edfab'
export const APP_SECRET = 'af125a0d5279fd576c1b4418a3e8276d'

export const ELECTRON_KEY = 'aa1e74ee4874176e'
export const ELECTRON_SECRET = '54e6a9a31b911cd5fc0daa66ebf94bc4'
export const ELECTRON_BUILD = '1001017006'

export type SignParams = Record<string, string | number>

/** 等价于 Python 的 urllib.parse.urlencode（默认 quote_plus） */
export function urlencode(params: SignParams): string {
  return Object.keys(params)
    .toSorted()
    .map((key) => `${quotePlus(key)}=${quotePlus(String(params[key]))}`)
    .join('&')
}

function quotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function signParams(
  params: SignParams,
  appKey: string,
  appSecret: string,
): SignParams & { sign: string } {
  const withKey: SignParams = { ...params, appkey: appKey }
  // urlencode 内部已按 key 排序
  const query = urlencode(withKey)
  const sign = createHash('md5').update(`${query}${appSecret}`).digest('hex')
  return { ...withKey, sign }
}

/** 直播姬 APP 签名 */
export function signApp(params: SignParams): SignParams & { sign: string } {
  return signParams(params, APP_KEY, APP_SECRET)
}

/** Electron 桌面端签名（开播走这个） */
export function signElectron(params: SignParams): SignParams & { sign: string } {
  return signParams(params, ELECTRON_KEY, ELECTRON_SECRET)
}
