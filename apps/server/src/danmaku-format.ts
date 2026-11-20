import type { DanmakuEvent } from '@ps5lb/shared'

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

/** 礼物、舰长、SC 才值得记 info，其余走 debug 免得刷屏 */
export function levelFor(event: DanmakuEvent): 'info' | 'debug' {
  return event.kind === 'gift' || event.kind === 'guard' || event.kind === 'superchat'
    ? 'info'
    : 'debug'
}
