import { useEffect, useRef } from 'react'

/** 订阅 SSE，断线自动重连由浏览器负责；回调里只关心数据 */
export function useEventStream<T>(url: string, onMessage: (data: T) => void): void {
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    const source = new EventSource(url)
    const handle = (event: MessageEvent<string>): void => {
      try {
        handler.current(JSON.parse(event.data) as T)
      } catch {
        // 忽略单条坏数据，保持连接
      }
    }
    source.addEventListener('message', handle)
    return () => {
      source.removeEventListener('message', handle)
      source.close()
    }
  }, [url])
}
