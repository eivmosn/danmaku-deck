import type { DanmakuEvent } from '@ps5lb/shared'
import { cn } from '@/lib/cn'

const KIND_META: Record<string, { icon: string; label: string }> = {
  gift: { icon: '🎁', label: '礼物' },
  guard: { icon: '🛡', label: '舰长' },
  superchat: { icon: '⚡', label: 'SC' },
  enter: { icon: '🚪', label: '进场' },
  follow: { icon: '＋', label: '关注' },
  like: { icon: '♥', label: '点赞' },
}

interface DanmakuListProps {
  items: DanmakuEvent[]
  empty?: string
  className?: string
}

export function DanmakuList({ items, empty = '还没有弹幕', className }: DanmakuListProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
        {empty}
      </div>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-1.5 overflow-y-auto', className)}>
      {items.map((item, index) => {
        const meta = KIND_META[item.kind]
        const color =
          item.platform === 'bilibili' ? 'var(--color-bilibili)' : 'var(--color-xiaohongshu)'
        return (
          <li
            key={`${item.at}-${item.user}-${index}`}
            className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
          >
            <span
              className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <div className="min-w-0">
              <span className="text-[11px] text-white/45">{item.user}</span>
              <p className="truncate text-sm text-white/90">
                {meta ? <span className="mr-1">{meta.icon}</span> : null}
                {item.kind === 'gift' && item.count > 1
                  ? `送出 ${item.text} ×${item.count}`
                  : item.text}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
