import { statusSchema, type Status } from '@ps5lb/shared'

/** 读取聚合状态；失败时抛出带上下文的错误，便于界面提示 */
export async function fetchStatus(signal?: AbortSignal): Promise<Status> {
  const response = await fetch('/api/status', { signal })
  if (!response.ok) {
    throw new Error(`状态接口返回 ${response.status}`)
  }
  return statusSchema.parse(await response.json())
}
