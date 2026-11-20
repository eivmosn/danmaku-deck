const ROOM_BY_UID = 'https://api.live.bilibili.com/room/v2/Room/room_id_by_uid'

/**
 * uid → 直播间号。
 * 账号里存的是 uid，弹幕要的是 room_id，两者不是一回事。
 */
export async function roomIdByUid(uid: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const response = await fetchImpl(`${ROOM_BY_UID}?uid=${encodeURIComponent(uid)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      Referer: 'https://live.bilibili.com/',
    },
  })
  const body = (await response.json()) as { code?: number; data?: { room_id?: number } }
  return body.code === 0 ? (body.data?.room_id ?? 0) : 0
}
