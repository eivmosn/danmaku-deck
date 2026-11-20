export const STATE_TEXT: Record<string, string> = {
  idle: '未开播',
  starting: '启动中',
  live: '直播中',
  stopping: '收尾中',
  error: '出错',
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 秒数转成 1:23:45 这种时长 */
export function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
