/**
 * B 站 wbi 签名。
 *
 * 参照旧桥 core/bili.py 的实现：`getDanmuInfo` 不带 wbi 签名会返回 -352，
 * 带上之后才会给 token 和真实弹幕服务器列表。
 */
import { createHash } from 'node:crypto'

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/** wbi 混流表，B 站前端写死的常量 */
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

/** 从 wbi 图片地址里取文件名（去掉目录和扩展名） */
function fileName(url: string): string {
  return url.split('/').pop()?.split('.')[0] ?? ''
}

interface Keys {
  mixin: string
  at: number
  cookieHash: string
}

let cache: Keys | null = null

/** 取 img_key + sub_key 混出的 32 位密钥，缓存 30 分钟 */
export async function wbiMixinKey(fetchImpl: typeof fetch = fetch, cookie = ''): Promise<string> {
  const cookieHash = cookie ? cookie.slice(0, 32) : 'anon'
  if (cache && cache.cookieHash === cookieHash && Date.now() - cache.at < 30 * 60_000) {
    return cache.mixin
  }

  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: 'https://www.bilibili.com/',
  }
  // 旧桥是带着登录态取密钥的；匿名取的密钥绑的是匿名身份，token 会收不到房间消息
  if (cookie) headers.Cookie = cookie

  const response = await fetchImpl(NAV_URL, { headers })
  const body = (await response.json()) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } }
  }
  const img = body.data?.wbi_img?.img_url ?? ''
  const sub = body.data?.wbi_img?.sub_url ?? ''
  const raw = fileName(img) + fileName(sub)
  if (raw.length < 32) throw new Error('取不到 wbi 密钥')

  const mixin = MIXIN_TAB.map((index) => raw[index] ?? '')
    .join('')
    .slice(0, 32)
  cache = { mixin, at: Date.now(), cookieHash }
  return mixin
}

/** 清缓存，-352 时强制重取（照旧桥的做法） */
export function clearWbiCache(): void {
  cache = null
}

/** 对查询参数签名，返回可直接拼到 URL 的字符串 */
export async function signWbi(
  params: Record<string, string | number>,
  fetchImpl: typeof fetch = fetch,
  cookie = '',
): Promise<string> {
  const mixin = await wbiMixinKey(fetchImpl, cookie)
  const all = { ...params, wts: Math.floor(Date.now() / 1000) }
  const query = Object.keys(all)
    .toSorted()
    .map((key) => {
      const value = String(all[key as keyof typeof all]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')
  const wRid = createHash('md5').update(`${query}${mixin}`).digest('hex')
  return `${query}&w_rid=${wRid}`
}

export { UA as WBI_USER_AGENT }
