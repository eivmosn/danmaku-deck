import { LogList } from '@/components/log-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveStore } from '@/stores/live'

export function LogsPage() {
  const logs = useLiveStore((state) => state.logs)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">日志</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          中文实时日志，按平台分色；同时落盘到 logs/ 目录
        </p>
      </header>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-sm">实时输出</CardTitle>
          <span className="text-[11px] text-[var(--muted-foreground)]">{logs.length} 条</span>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <LogList entries={logs} className="h-full" />
        </CardContent>
      </Card>
    </div>
  )
}
