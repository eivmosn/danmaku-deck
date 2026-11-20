import type { Platform } from '@ps5lb/shared'
import { useState } from 'react'
import { DanmakuList } from '@/components/danmaku-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { useLiveStore } from '@/stores/live'

const FILTERS: Array<{ key: Platform | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'bilibili', label: '哔哩哔哩' },
  { key: 'xiaohongshu', label: '小红书' },
]

export function DanmakuPage() {
  const danmaku = useLiveStore((state) => state.danmaku)
  const [filter, setFilter] = useState<Platform | 'all'>('all')

  const items = filter === 'all' ? danmaku : danmaku.filter((item) => item.platform === filter)

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">弹幕</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            两个平台的弹幕、礼物、进场混在一条时间线上
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--color-elevated)] p-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors',
                item.key === filter
                  ? 'bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-fg)]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-sm">实时时间线</CardTitle>
          <span className="text-[11px] text-[var(--color-muted)]">{items.length} 条</span>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <DanmakuList items={items} className="h-full" empty="等 PS5 开播后出现" />
        </CardContent>
      </Card>
    </div>
  )
}
