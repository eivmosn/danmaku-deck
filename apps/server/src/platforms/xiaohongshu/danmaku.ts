import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { DanmakuEvent, DanmakuKind } from '@danmaku-deck/shared'

/**
 * 小红书弹幕通过 catbus CLI 获取（旧桥验证过的方案）：
 *   catbus xhs live listen <roomId> --duration 3600
 * 每行一个 JSON，字段：{ type, time, user: { name, id }, text, gift: { name, count } }
 */

interface RawEvent {
  type?: string
  time?: string
  user?: { name?: string; id?: string }
  text?: string | null
  gift?: { name?: string; count?: number } | null
}

const LABEL: Record<string, string> = {
  enter: '进入了直播间',
  follow: '关注了主播',
  like: '点了赞',
}

/** 把 catbus 的一行 JSON 转成统一事件；无关事件返回 null */
export function parseCatbusLine(line: string): DanmakuEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null

  let raw: RawEvent
  try {
    raw = JSON.parse(trimmed) as RawEvent
  } catch {
    return null
  }

  const kind = raw.type ?? ''
  const user = raw.user?.name ?? ''
  // 进场/关注/点赞有时不带昵称，丢掉就整条欢迎没了；弹幕和礼物没昵称才真没法显示
  const needsUser = kind === 'chat' || kind === 'gift'
  if (!user && (needsUser || !LABEL[kind])) return null

  const giftName = raw.gift?.name ?? ''
  const giftCount = Number(raw.gift?.count ?? 0)
  const giftText = giftName ? (giftCount > 1 ? `${giftName} ×${giftCount}` : giftName) : ''
  const text = (raw.text ?? '').trim() || giftText || LABEL[kind] || ''
  if (!text) return null

  const mapped: DanmakuKind =
    kind === 'gift'
      ? 'gift'
      : kind === 'enter'
        ? 'enter'
        : kind === 'follow'
          ? 'follow'
          : kind === 'like'
            ? 'like'
            : 'chat'

  if (
    kind !== 'chat' &&
    kind !== 'gift' &&
    kind !== 'enter' &&
    kind !== 'follow' &&
    kind !== 'like'
  ) {
    return null
  }

  return {
    platform: 'xiaohongshu',
    kind: mapped,
    user,
    text: mapped === 'gift' ? giftName || text : text,
    count: mapped === 'gift' ? giftCount : 0,
    at: raw.time ?? new Date().toISOString(),
  }
}

/**
 * `--raw` 模式的解析：catbus 用 --raw 时直接吐平台原始对象，
 * 字段按它自己 normalize 里的 roomEvent 来（customData.type / desc / profile / gift）。
 * 有了这个，开诊断开关也不会把弹幕弄丢。
 */
interface RawPushPayload {
  ts?: number
  customData?: {
    type?: string
    desc?: string
    current_time?: number
    count?: number
    profile?: { nickname?: string; user_id?: string }
    /** 进场/关注走这个 */
    user_info?: { nick_name?: string; nickname?: string; id?: string }
    /** 礼物走这个（下划线命名，与 profile 不是一套） */
    send_user_info?: { nick_name?: string; id?: string }
    receive_user_info?: { nick_name?: string; id?: string }
    base_gift_info?: { id?: number; name?: string; coins?: number; icon?: string }
    gift_action_info?: {
      count?: number
      comb_count?: number
      gift_id?: number
      gift_extra_info?: { gift_name?: string }
    }
    praise_info?: { count?: number }
    gift?: { name?: string; count?: number }
    gift_info?: { name?: string; count?: number }
  }
}

export function parseCatbusRawLine(line: string): DanmakuEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null

  let payload: RawPushPayload
  try {
    payload = JSON.parse(trimmed) as RawPushPayload
  } catch {
    return null
  }

  const custom = payload.customData
  if (!custom || typeof custom !== 'object') return null

  const type = String(custom.type ?? '')
  const profileUser = custom.profile?.nickname ?? ''
  // 礼物的用户字段是 send_user_info.nick_name（下划线），text/进场是 profile.nickname
  const sendUser = custom.send_user_info?.nick_name ?? ''
  const joinUser = custom.user_info?.nick_name ?? custom.user_info?.nickname ?? profileUser
  const stamp = payload.ts ?? custom.current_time
  const at = stamp ? new Date(stamp).toISOString() : new Date().toISOString()

  switch (type) {
    case 'text':
    case 'text_message':
      if (!profileUser || !custom.desc) return null
      return {
        platform: 'xiaohongshu',
        kind: 'chat',
        user: profileUser,
        text: custom.desc,
        count: 0,
        at,
      }
    // 真实抓包：gift_dock_and_effect
    //   send_user_info.nick_name        送礼人
    //   base_gift_info.name / coins     礼物名 / 单价
    //   gift_action_info.count          本次数量（comb_count 是连击累计）
    case 'gift_dock_and_effect':
    case 'gift': {
      const user = sendUser || profileUser
      const name =
        custom.base_gift_info?.name ??
        custom.gift_action_info?.gift_extra_info?.gift_name ??
        custom.gift?.name ??
        custom.gift_info?.name ??
        custom.desc ??
        ''
      const count =
        Number(
          custom.gift_action_info?.count ?? custom.gift?.count ?? custom.gift_info?.count ?? 0,
        ) || 1
      if (!name) return null
      return { platform: 'xiaohongshu', kind: 'gift', user, text: name, count, at }
    }
    // 点赞家族：praise / like / combo_praise / light / like_comment / live_like / live_common_msg_action
    case 'praise':
    case 'like':
    case 'combo_praise':
    case 'light':
    case 'like_comment':
    case 'live_like':
    case 'live_common_msg_action': {
      const count = Number(custom.praise_info?.count ?? custom.count ?? 0) || 1
      return { platform: 'xiaohongshu', kind: 'like', user: profileUser, text: '点了赞', count, at }
    }
    case 'audience_join_v2':
    case 'fansgroup_join_room_effect':
    case 'come':
    case 'enter':
    case 'enter_room':
      return {
        platform: 'xiaohongshu',
        kind: 'enter',
        user: joinUser,
        text: '进入了直播间',
        count: 1,
        at,
      }
    case 'follow_emcee':
    case 'follow':
      return {
        platform: 'xiaohongshu',
        kind: 'follow',
        user: profileUser,
        text: '关注了主播',
        count: 1,
        at,
      }
    default:
      // viewer_heart / audience_num / letter_refresh 之类没有展示价值
      return null
  }
}

export interface XhsDanmakuOptions {
  roomId: string
  cookie: string
  onEvent: (event: DanmakuEvent) => void
  onState?: (
    state: 'connecting' | 'online' | 'closed' | 'error' | 'notice',
    detail?: string,
  ) => void
  spawnImpl?: typeof spawn
  /** catbus 可执行文件路径，默认从 PATH 找 */
  command?: string
  /** 是否用 --raw 模式（默认跟随 PS5LB_XHS_RAW，未设置时为 true） */
  raw?: boolean
}

export class XiaohongshuDanmakuClient {
  private child: ChildProcess | null = null
  private buffer = ''
  private stopped = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** 连续重连次数，收到任何一条消息就清零 */
  private attempts = 0
  private readonly options: XhsDanmakuOptions

  constructor(options: XhsDanmakuOptions) {
    this.options = options
  }

  async connect(): Promise<void> {
    if (this.stopped) return
    this.options.onState?.('connecting')
    const spawnImpl = this.options.spawnImpl ?? spawn
    // catbus 通过环境变量拿 cookie，避免命令里出现凭证
    // 注意：同一个房间只允许一条弹幕连接，多开会互相踢，所以绝不能并发两条
    const args = ['xhs', 'live', 'listen', this.options.roomId, '--duration', '3600']
    // 默认走 --raw：catbus 的归一化只认 come/enter/enter_room 和 gift，
    // 而小红书真实类型是 audience_join_v2 / gift_dock_and_effect / follow_emcee，
    // 归一化会把这些统统压成 other，类型信息就丢了。
    if (this.rawMode()) args.push('--raw')
    const child = spawnImpl(this.options.command ?? 'catbus', args, {
      env: { ...process.env, CATBUS_XHS_COOKIE: this.options.cookie },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    child.stdout?.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim()
      if (!line) return
      // catbus 的「N 秒后重连（第 M 次）」是它自己在退避重试，不是致命错误
      if (/重连|reconnect|retry/i.test(line)) {
        this.options.onState?.('notice', line.slice(0, 200))
        return
      }
      this.options.onState?.('error', line.slice(0, 200))
    })
    child.on('error', (error) => {
      this.options.onState?.('error', error.message)
    })
    child.on('exit', () => {
      this.child = null
      if (this.stopped) return
      this.options.onState?.('closed')
      // 进程没了必须自己拉起来：catbus 带 --duration 3600，满一小时会自己退出，
      // 不重连的话小红书的弹幕从此永久静默。
      this.scheduleReconnect()
    })

    this.options.onState?.('online')
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const child = this.child
    this.child = null
    child?.kill('SIGTERM')
  }

  /** --raw 默认开启：归一化会把 gift_dock_and_effect / audience_join_v2 压成 other，类型就丢了 */
  private rawMode(): boolean {
    return this.options.raw ?? process.env.PS5LB_XHS_RAW !== '0'
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts, 5))
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.stopped) return
      void this.connect().catch((error: unknown) => {
        this.options.onState?.('error', error instanceof Error ? error.message : '重连失败')
        this.attempts += 1
        this.scheduleReconnect()
      })
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private handleChunk(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8')
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    const rawMode = this.rawMode()
    for (const line of lines) {
      const event = rawMode ? parseCatbusRawLine(line) : parseCatbusLine(line)
      if (event) {
        // 收到消息说明链路是活的，重连退避从头算
        this.attempts = 0
        this.options.onEvent(event)
        // 礼物文案还是兜底值，说明字段名猜错了：把原始报文留一份
        if (rawMode && event.kind === 'gift' && event.text === '礼物') {
          this.options.onState?.('notice', line.trim().slice(0, 400))
        }
        continue
      }
      if (rawMode && line.trim().startsWith('{')) {
        // 没能归类 → 打出来看是什么类型；礼物字段没认出来（只剩兜底文案）也要打，
        // 这样下一场直播就能确定 gift_dock_and_effect 里到底叫什么字段。
        this.options.onState?.('notice', line.trim().slice(0, 400))
      }
    }
  }
}
