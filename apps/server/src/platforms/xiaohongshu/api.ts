import type { PushTarget } from '@/push/ffmpeg-pusher'

/**
 * 小红书直播接口。
 *
 * 端点与字段对齐现有桥（ps5lb/xhs-bridge.mjs）里跑通的实现：
 *   GET /web_api/sns/v1/live/obs/host_auth_info   → data.allow_obs（是否有 OBS 权限）
 *   GET /web_api/sns/v1/live/obs/push_url?code=6位 → 用开播码换推流地址
 *   GET /web_api/sns/v1/live/obs/living_push_url   → 当前正在播的推流地址（data.living）
 *
 * 密钥在 main_push_info.stream_key，服务器在 main_push_info.server_address。
 */

const BASE = 'https://www.xiaohongshu.com'
const DEFAULT_SERVER = 'rtmp://live-push.xhscdn.com/live/'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

export interface XhsResult<T> {
  ok: boolean
  data?: T
  detail?: string
}

export interface PushInfo {
  key: string
  server: string
}

interface RawPayload {
  code?: number
  msg?: string
  data?: Record<string, unknown>
}

export class XiaohongshuApi {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl
  }

  /** 有 OBS 权限才能拿到推流地址 */
  async hostAuth(cookie: string): Promise<XhsResult<{ allowObs: boolean }>> {
    const result = await this.get(cookie, '/web_api/sns/v1/live/obs/host_auth_info')
    if (!result.ok) return { ok: false, detail: result.detail }
    return { ok: true, data: { allowObs: Boolean(result.data?.allow_obs) } }
  }

  /** 6 位开播码换推流地址；每场都要换一次 */
  async pushUrlByCode(cookie: string, code: string): Promise<XhsResult<PushInfo>> {
    const result = await this.get(
      cookie,
      `/web_api/sns/v1/live/obs/push_url?code=${encodeURIComponent(code)}`,
    )
    if (!result.ok) return { ok: false, detail: result.detail }
    const info = extractPush(result.data)
    return info.key ? { ok: true, data: info } : { ok: false, detail: '没拿到推流密钥' }
  }

  /** 当前正在进行的直播的推流地址 */
  async livingPushUrl(cookie: string): Promise<XhsResult<PushInfo>> {
    const result = await this.get(cookie, '/web_api/sns/v1/live/obs/living_push_url')
    if (!result.ok) return { ok: false, detail: result.detail }
    if (!result.data?.living) return { ok: false, detail: '当前没有在直播' }
    const info = extractPush(result.data)
    return info.key ? { ok: true, data: info } : { ok: false, detail: '在直播，但没拿到密钥' }
  }

  private async get(
    cookie: string,
    path: string,
  ): Promise<{ ok: boolean; data?: Record<string, unknown>; detail?: string }> {
    if (!cookie.trim()) return { ok: false, detail: '还没配置小红书 cookie' }

    const response = await this.fetchImpl(`${BASE}${path}`, {
      headers: {
        Cookie: cookie,
        'User-Agent': UA,
        Referer: 'https://www.xiaohongshu.com/zhibo/obs',
        Accept: 'application/json, text/plain, */*',
      },
    })

    const payload = (await response.json().catch(() => null)) as RawPayload | null
    if (!payload) return { ok: false, detail: `接口返回非 JSON（HTTP ${response.status}）` }
    if (payload.code !== 0) {
      return { ok: false, detail: payload.msg ?? `code=${payload.code}` }
    }
    return { ok: true, data: payload.data ?? {} }
  }
}

/** 字段兼容处理：接口在不同版本里给过驼峰与下划线两套命名 */
export function extractPush(data: Record<string, unknown> | undefined): PushInfo {
  const main = (data?.main_push_info ?? data?.mainPushInfo ?? {}) as Record<string, unknown>
  const key = String(
    main.stream_key ?? main.streamKey ?? data?.push_url ?? data?.streamKey ?? '',
  ).trim()
  const server = String(main.server_address ?? main.serverAddress ?? '').trim() || DEFAULT_SERVER
  return { key, server }
}

export function toTarget(info: PushInfo): PushTarget {
  return { platform: 'xiaohongshu', server: info.server, key: info.key }
}
