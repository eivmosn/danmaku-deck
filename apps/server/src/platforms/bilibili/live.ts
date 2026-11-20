import type { PushTarget } from '@/push/ffmpeg-pusher'
import { ELECTRON_BUILD, signApp, signElectron } from './sign'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

const ROOM_BY_UID = 'https://api.live.bilibili.com/room/v2/Room/room_id_by_uid'
const SERVER_TIME = 'https://api.bilibili.com/x/report/click/now'
const LIVE_VERSION =
  'https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion'
const START_LIVE = 'https://api.live.bilibili.com/room/v1/Room/startLive'

export interface StartLiveOptions {
  uid: string
  areaId?: string
  cookie: string
  /** 通常是 cookie 里的 bili_jct */
  csrf: string
  fetchImpl?: typeof fetch
}

/**
 * 调用 B 站开播接口拿推流地址。
 *
 * 流程与 ps5lb 一致：
 *   1. uid → room_id
 *   2. 取服务器时间并签 APP 参数查直播姬版本
 *   3. 用 Electron 签名 POST Room/startLive，取 data.rtmp.addr/code
 */
export class BilibiliLive {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl
  }

  async startLive(options: StartLiveOptions): Promise<PushTarget> {
    const fetchImpl = options.fetchImpl ?? this.fetchImpl
    const headers = {
      'User-Agent': UA,
      Cookie: options.cookie,
      Referer: 'https://live.bilibili.com/',
    }

    const roomId = await this.roomIdByUid(options.uid, fetchImpl, headers)
    if (!roomId) throw new Error('拿不到直播间号')

    const ts = await this.serverTime(fetchImpl, headers)

    const versionQuery = new URLSearchParams(
      signApp({ system_version: 2, ts }) as unknown as Record<string, string>,
    )
    await fetchImpl(`${LIVE_VERSION}?${versionQuery.toString()}`, { headers })

    const payload = signElectron({
      room_id: roomId,
      platform: 'web_electron_link',
      area_v2: options.areaId ?? '236',
      csrf: options.csrf,
      csrf_token: options.csrf,
      build: ELECTRON_BUILD,
      ts,
    })

    const response = await fetchImpl(START_LIVE, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload as unknown as Record<string, string>).toString(),
    })
    const body = (await response.json()) as {
      code?: number
      message?: string
      msg?: string
      data?: { rtmp?: { addr?: string; code?: string } }
    }
    if (body.code !== 0) {
      throw new Error(body.message ?? body.msg ?? `开播接口返回 ${body.code}`)
    }
    const addr = body.data?.rtmp?.addr
    const key = body.data?.rtmp?.code
    if (!addr || !key) throw new Error('B 站没给推流地址（可能分区不可用）')
    return { platform: 'bilibili', server: addr, key }
  }

  private async roomIdByUid(
    uid: string,
    fetchImpl: typeof fetch,
    headers: Record<string, string>,
  ): Promise<number> {
    const response = await fetchImpl(`${ROOM_BY_UID}?uid=${encodeURIComponent(uid)}`, { headers })
    const body = (await response.json()) as { code?: number; data?: { room_id?: number } }
    return body.code === 0 ? (body.data?.room_id ?? 0) : 0
  }

  private async serverTime(
    fetchImpl: typeof fetch,
    headers: Record<string, string>,
  ): Promise<number> {
    const response = await fetchImpl(SERVER_TIME, { headers })
    const body = (await response.json()) as { code?: number; data?: { now?: number } }
    if (body.code !== 0 || !body.data?.now) throw new Error('取服务器时间失败')
    return body.data.now
  }
}
