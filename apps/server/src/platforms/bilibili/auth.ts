/**
 * B 站扫码登录。
 *
 * 接口来自实测（2026-11-20）：
 *   GET  https://passport.bilibili.com/x/passport-login/web/qrcode/generate
 *        → { code: 0, data: { url, qrcode_key } }
 *   GET  https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=…
 *        → { code: 0, data: { url, refresh_token, timestamp, code, message } }
 *          data.code: 0 成功 / 86101 未扫码 / 86090 已扫码待确认 / 86038 已过期
 * 登录成功后凭证同时出现在 Set-Cookie 与 data.url 的查询参数里。
 */

const GENERATE_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'

const COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'] as const

export type QRState = 'pending' | 'scanned' | 'success' | 'expired' | 'error'

export interface QRStart {
  key: string
  url: string
}

export interface QRResult {
  state: QRState
  message: string
  credentials?: Record<string, string>
}

export interface BilibiliProfile {
  uid: string
  name: string
}

interface GeneratePayload {
  data?: { url?: string; qrcode_key?: string }
}

interface PollPayload {
  data?: { url?: string; code?: number; message?: string }
}

interface NavPayload {
  code?: number
  data?: { mid?: number; uname?: string }
}

const STATE_BY_CODE: Record<number, { state: QRState; message: string }> = {
  0: { state: 'success', message: '登录成功' },
  86101: { state: 'pending', message: '未扫码' },
  86090: { state: 'scanned', message: '已扫码，等待手机确认' },
  86038: { state: 'expired', message: '二维码已过期' },
}

export class BilibiliAuth {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl
  }

  async startQR(): Promise<QRStart> {
    const response = await this.fetchImpl(GENERATE_URL, { headers: browserHeaders() })
    const payload = (await response.json()) as GeneratePayload
    const key = payload.data?.qrcode_key
    const url = payload.data?.url
    if (!key || !url) throw new Error('B 站没有返回二维码')
    return { key, url }
  }

  async pollQR(key: string): Promise<QRResult> {
    const response = await this.fetchImpl(`${POLL_URL}?qrcode_key=${encodeURIComponent(key)}`, {
      headers: browserHeaders(),
    })
    const payload = (await response.json()) as PollPayload
    const code = payload.data?.code ?? -1
    const meta = STATE_BY_CODE[code]
    if (!meta) return { state: 'error', message: payload.data?.message ?? `未知状态 ${code}` }
    if (meta.state !== 'success') return { state: meta.state, message: meta.message }

    const fromHeader = parseCookies(response.headers.getSetCookie())
    const fromUrl = parseCookiesFromUrl(payload.data?.url ?? '')
    const credentials = { ...fromUrl, ...fromHeader }
    return { state: 'success', message: meta.message, credentials }
  }

  /** 用拿到的 cookie 查昵称与 uid，确认凭证可用 */
  async profile(credentials: Record<string, string>): Promise<BilibiliProfile> {
    const cookie = Object.entries(credentials)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
    const response = await this.fetchImpl(NAV_URL, {
      headers: { ...browserHeaders(), Cookie: cookie },
    })
    const payload = (await response.json()) as NavPayload
    if (payload.code !== 0 || !payload.data?.mid) throw new Error('凭证无效，取不到账号信息')
    return { uid: String(payload.data.mid), name: payload.data.uname ?? '未知昵称' }
  }
}

function browserHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    Referer: 'https://www.bilibili.com/',
  }
}

/** 从 Set-Cookie 头里挑出登录凭证 */
function parseCookies(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const header of headers) {
    const [pair] = header.split(';')
    const index = pair?.indexOf('=') ?? -1
    if (!pair || index <= 0) continue
    const name = pair.slice(0, index)
    if (!COOKIE_KEYS.includes(name as (typeof COOKIE_KEYS)[number])) continue
    result[name] = decodeURIComponent(pair.slice(index + 1))
  }
  return result
}

/** 登录成功时 data.url 上同样带着凭证 */
function parseCookiesFromUrl(url: string): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const query = new URL(url).searchParams
    for (const key of COOKIE_KEYS) {
      const value = query.get(key)
      if (value) result[key] = value
    }
  } catch {
    // url 为空或格式异常时忽略，凭证以上面的 Set-Cookie 为准
  }
  return result
}
