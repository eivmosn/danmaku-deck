import type { DanmakuEvent } from '@danmaku-deck/shared'

/** 把一条事件转成中文日志文案（Web、日志文件、终端共用） */
export function describe(event: DanmakuEvent): string {
  switch (event.kind) {
    case 'gift':
      return `${event.user} 送出 ${event.text}${event.count > 1 ? ` ×${event.count}` : ''}`
    case 'guard':
      return `${event.user} 开通了${event.text}`
    case 'superchat':
      return `${event.user} 发了醒目留言：${event.text}`
    case 'enter':
      return `${event.user} 进入了直播间`
    case 'follow':
      return `${event.user} 关注了主播`
    case 'like':
      return `${event.user} 分享了直播间`
    default:
      return `${event.user}：${event.text}`
  }
}

/** 只取正文，昵称由 IRC 的消息头携带，避免屏幕上重复 */
export function describeBody(event: DanmakuEvent): string {
  switch (event.kind) {
    case 'gift':
      return `送出 ${event.text}${event.count > 1 ? ` ×${event.count}` : ''}`
    case 'guard':
      return `开通了${event.text}`
    case 'superchat':
      return `醒目留言：${event.text}`
    case 'enter':
      return '进入了直播间'
    case 'follow':
      return '关注了主播'
    case 'like':
      return '分享了直播间'
    default:
      return event.text
  }
}

/** 礼物、舰长、SC 才值得记 info，其余走 debug 免得刷屏 */
export function levelFor(event: DanmakuEvent): 'info' | 'debug' {
  return event.kind === 'gift' || event.kind === 'guard' || event.kind === 'superchat'
    ? 'info'
    : 'debug'
}
