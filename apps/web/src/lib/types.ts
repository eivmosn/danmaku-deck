export interface LogEntry {
  id: number
  at: string
  atLocal: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
  fields?: Record<string, unknown>
}
