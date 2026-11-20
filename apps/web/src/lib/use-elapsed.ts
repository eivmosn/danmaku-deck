import { useEffect, useRef, useState } from 'react'

/**
 * 把服务端给的「已播秒数」变成会自己走的数。
 *
 * 服务端只在状态变化时推 SSE，直接渲染 uptimeSeconds 会在两次推送之间冻住，
 * 推哪个平台都不该影响这个计时——它只跟 PS5 这一场直播的开始时刻有关。
 */
export function useElapsedSeconds(seconds: number): number {
  const anchor = useRef({ at: Date.now(), seconds })
  const [, forceTick] = useState(0)

  // 服务端给了新值就以新值为准，重新起算
  if (anchor.current.seconds !== seconds) {
    anchor.current = { at: Date.now(), seconds }
  }

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const drift = Math.floor((Date.now() - anchor.current.at) / 1000)
  return Math.max(0, anchor.current.seconds + drift)
}
