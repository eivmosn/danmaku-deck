import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseCatbusLine, parseCatbusRawLine, XiaohongshuDanmakuClient } from './danmaku'

/** 行格式来自 catbus 的实际输出（旧桥 xhs-bridge.mjs 里同款解析） */
const lines = {
  chat: '{"type":"chat","time":"2026-11-20T10:00:00Z","user":{"name":"观众乙","id":"u1"},"text":"主播好呀"}',
  gift: '{"type":"gift","time":"2026-11-20T10:00:01Z","user":{"name":"观众乙"},"gift":{"name":"花","count":3}}',
  enter: '{"type":"enter","time":"2026-11-20T10:00:02Z","user":{"name":"路人"}}',
  follow: '{"type":"follow","time":"2026-11-20T10:00:03Z","user":{"name":"新粉"}}',
  noise: 'warning: something happened',
  unknown: '{"type":"viewer_heart","user":{"name":"x"}}',
}

describe('parseCatbusLine', () => {
  it('弹幕', () => {
    expect(parseCatbusLine(lines.chat)).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'chat',
      user: '观众乙',
      text: '主播好呀',
    })
  })

  it('礼物带数量', () => {
    expect(parseCatbusLine(lines.gift)).toMatchObject({
      kind: 'gift',
      user: '观众乙',
      text: '花',
      count: 3,
    })
  })

  it('进场、关注都有兜底文案', () => {
    expect(parseCatbusLine(lines.enter)).toMatchObject({ kind: 'enter', text: '进入了直播间' })
    expect(parseCatbusLine(lines.follow)).toMatchObject({ kind: 'follow', text: '关注了主播' })
  })

  it('非 JSON 行与无关事件被忽略', () => {
    expect(parseCatbusLine(lines.noise)).toBeNull()
    expect(parseCatbusLine(lines.unknown)).toBeNull()
    expect(parseCatbusLine('')).toBeNull()
  })
})

describe('XiaohongshuDanmakuClient', () => {
  it('把进程输出按行解析成事件', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const events: unknown[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: '700000000000000001',
      cookie: 'a1=x',
      onEvent: (event) => events.push(event),
      spawnImpl: vi.fn(() => child) as never,
      raw: false,
    })

    await client.connect()
    child.stdout.emit('data', Buffer.from(`${lines.chat}\n${lines.gift}\n`))

    expect(events).toHaveLength(2)
    client.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('半行会等到下一块再解析', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const events: unknown[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: (event) => events.push(event),
      spawnImpl: vi.fn(() => child) as never,
      raw: false,
    })

    await client.connect()
    const full = lines.chat
    child.stdout.emit('data', Buffer.from(full.slice(0, 20)))
    expect(events).toHaveLength(0)
    child.stdout.emit('data', Buffer.from(`${full.slice(20)}\n`))
    expect(events).toHaveLength(1)
    client.stop()
  })
})

/** catbus 带 --duration 3600，满一小时会自己退出；退出后不重连就会永久静默 */
function makeChild(): EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: () => void
} {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  }) as never
}

describe('子进程退出后自动重连', () => {
  it('exit 之后会自动再 spawn 一个', async () => {
    vi.useFakeTimers()
    const children = [makeChild(), makeChild()]
    let index = 0
    const spawnImpl = vi.fn(() => children[index++])
    const states: string[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      onState: (state) => states.push(state),
      spawnImpl: spawnImpl as never,
    })

    await client.connect()
    expect(spawnImpl).toHaveBeenCalledTimes(1)

    children[0]!.emit('exit')
    expect(states).toContain('closed')

    await vi.advanceTimersByTimeAsync(1200)
    expect(spawnImpl).toHaveBeenCalledTimes(2)
    client.stop()
    vi.useRealTimers()
  })

  it('catbus 的重连提示走 notice，不算 error', async () => {
    const child = makeChild()
    const states: string[] = []
    const details: string[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      onState: (state, detail) => {
        states.push(state)
        if (detail) details.push(detail)
      },
      spawnImpl: (() => child) as never,
    })

    await client.connect()
    child.stderr.emit('data', Buffer.from('[catbus] 4 秒后重连（第 3 次）\n'))
    expect(states).toContain('notice')
    expect(states).not.toContain('error')
    client.stop()
  })

  it('stop 之后不再重连', async () => {
    vi.useFakeTimers()
    const child = makeChild()
    const spawnImpl = vi.fn(() => child)
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      spawnImpl: spawnImpl as never,
    })

    await client.connect()
    client.stop()
    child.emit('exit')
    await vi.advanceTimersByTimeAsync(5000)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('进场消息', () => {
  it('没有昵称的进场也不丢，昵称留空由界面兜底', () => {
    const event = parseCatbusLine('{"type":"enter","time":"2026-11-20T10:00:02Z"}')
    expect(event).toMatchObject({ platform: 'xiaohongshu', kind: 'enter', user: '' })
    expect(event?.text).toBe('进入了直播间')
  })

  it('弹幕没有昵称仍然丢弃', () => {
    expect(parseCatbusLine('{"type":"chat","text":"你好"}')).toBeNull()
  })

  it('无法归类的事件仍然丢弃', () => {
    expect(parseCatbusLine('{"type":"other","user":null,"text":null}')).toBeNull()
  })
})

describe('parseCatbusRawLine（--raw 模式）', () => {
  /** 真实报文：2026-11-20 22:31 抓自 catbus xhs live listen --raw */
  const realText = JSON.stringify({
    command: 1,
    customData: {
      type: 'text',
      current_time: 1795185111904,
      desc: '她',
      profile: { nickname: '喵喵喵大福', user_id: '59f3046811be10677b852191' },
    },
    ts: 1795185111928,
  })

  it('真实弹幕报文能解析出昵称和正文', () => {
    const event = parseCatbusRawLine(realText)
    expect(event).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'chat',
      user: '喵喵喵大福',
      text: '她',
    })
  })

  it('进场/关注/点赞按 catbus 的字段映射', () => {
    const at = '{"ts":1795185111928,"customData":{"type":"come","profile":{"nickname":"路人甲"}}}'
    expect(parseCatbusRawLine(at)).toMatchObject({ kind: 'enter', user: '路人甲' })

    const follow =
      '{"ts":1795185111928,"customData":{"type":"follow","profile":{"nickname":"新粉"}}}'
    expect(parseCatbusRawLine(follow)).toMatchObject({ kind: 'follow', user: '新粉' })

    const praise =
      '{"ts":1795185111928,"customData":{"type":"praise","profile":{"nickname":"点赞的"}}}'
    expect(parseCatbusRawLine(praise)).toMatchObject({ kind: 'like', user: '点赞的' })
  })

  it('礼物取 gift.name / count', () => {
    const gift = JSON.stringify({
      ts: 1795185111928,
      customData: {
        type: 'gift',
        gift: { name: '小心心', count: 3 },
        profile: { nickname: '送礼的' },
      },
    })
    expect(parseCatbusRawLine(gift)).toMatchObject({
      kind: 'gift',
      user: '送礼的',
      text: '小心心',
      count: 3,
    })
  })

  it('内部事件（心跳/人数/信件）忽略', () => {
    for (const type of ['viewer_heart', 'audience_num', 'letter_refresh']) {
      expect(parseCatbusRawLine(`{"customData":{"type":"${type}"}}`)).toBeNull()
    }
  })
})

describe('进场事件 audience_join_v2', () => {
  /** 真实报文：2026-11-20 22:50 抓自 catbus xhs live listen --raw */
  const realJoin = JSON.stringify({
    command: 1,
    customData: {
      type: 'audience_join_v2',
      current_time: 1795186257113,
      profile: { nickname: 'MJ', user_id: '5da87fb80000000001000800', avatar: 'x' },
      source: 'slide',
      pre_source: 'explore_feed_card',
      ack_code: 1,
    },
    msgId: '1441078369080311810',
    roomId: '570550179512781886',
    ts: 1795186257171,
  })

  it('raw 路径能认出 audience_join_v2', () => {
    expect(parseCatbusRawLine(realJoin)).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'enter',
      user: 'MJ',
      text: '进入了直播间',
    })
  })

  it('归一化路径的 other 不再当成进场', () => {
    // catbus 把 gift_dock_and_effect / follow_emcee 都压成 other，
    // 以前「other + 有昵称 = 进场」会把礼物和关注误显示成「进入了直播间」。
    const normalized =
      '{"type":"other","time":"2026-11-20T14:50:57Z","user":{"name":"MJ","id":"5da87fb8"},"text":null}'
    expect(parseCatbusLine(normalized)).toBeNull()
  })

  it('不带昵称的 other 仍然忽略（排行榜横幅之类）', () => {
    expect(parseCatbusLine('{"type":"other","user":null,"text":null}')).toBeNull()
    expect(parseCatbusLine('{"type":"other","text":"榜单"}')).toBeNull()
  })
})

/** 构造一条 catbus --raw 的原始输出；字段名依据 DimSum 文档列出的 xiaohongshu.* 消息族 */
function rawEvent(customData: Record<string, unknown>): string {
  return JSON.stringify({ ts: 1795200000000, customData })
}

describe('小红书礼物与关注（真实类型名）', () => {
  // 类型名依据 DimSum Chat 文档列出的 xiaohongshu.* 消息族：
  //   text / gift_dock_and_effect / praise / audience_join_v2 / follow_emcee
  /**
   * 真实报文：webcast-mate 抓包样本 docs/samples/xhs-proto-capture.json 里
   * gift_dock_and_effect 的 customData（只留相关字段）。
   */
  const realGift = {
    type: 'gift_dock_and_effect',
    current_time: 1786806861365,
    room_info: { id: '570409528162863169', host_id: '64ccb022000000000e0241a5' },
    send_user_info: { id: '649cddab0000000025035f4e', nick_name: '江南雨', role: 0 },
    receive_user_info: { id: '64ccb022000000000e0241a5', nick_name: '活不腻来相亲', role: 0 },
    base_gift_info: { id: '137925940106684781', name: '比心', type: 0, coins: 1 },
    gift_action_info: {
      gift_id: '137925940106684781',
      count: 1,
      comb_count: 4,
      gift_extra_info: { gift_name: '比心' },
    },
  }

  it('真实礼物报文：送礼人取 send_user_info.nick_name，礼物名取 base_gift_info.name', () => {
    const event = parseCatbusRawLine(rawEvent(realGift))
    expect(event).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'gift',
      user: '江南雨',
      text: '比心',
      count: 1,
    })
  })

  it('连击时取 gift_action_info.count，不取 comb_count', () => {
    const combo = {
      ...realGift,
      gift_action_info: { ...realGift.gift_action_info, count: 3, comb_count: 12 },
    }
    expect(parseCatbusRawLine(rawEvent(combo))).toMatchObject({ count: 3 })
  })

  it('礼物名缺失时返回 null（不产出无意义的礼物事件）', () => {
    const broken = { type: 'gift_dock_and_effect', send_user_info: { nick_name: 'A' } }
    expect(parseCatbusRawLine(rawEvent(broken))).toBeNull()
  })

  it('点赞家族取 praise_info.count', () => {
    const praise = { type: 'praise', profile: { nickname: '点赞的' }, praise_info: { count: 7 } }
    expect(parseCatbusRawLine(rawEvent(praise))).toMatchObject({
      kind: 'like',
      user: '点赞的',
      count: 7,
    })
  })

  it('fansgroup_join_room_effect 也是进场', () => {
    const fans = { type: 'fansgroup_join_room_effect', user_info: { nick_name: '粉丝团' } }
    expect(parseCatbusRawLine(rawEvent(fans))).toMatchObject({ kind: 'enter', user: '粉丝团' })
  })

  it('follow_emcee 认成关注', () => {
    const event = parseCatbusRawLine(
      rawEvent({ type: 'follow_emcee', profile: { nickname: '新粉' } }),
    )
    expect(event).toMatchObject({ kind: 'follow', user: '新粉', text: '关注了主播' })
  })
})
