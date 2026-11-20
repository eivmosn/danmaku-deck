import type { DanmakuEvent } from '@ps5lb/shared'
import {
  DoorOpen,
  Gift,
  Heart,
  MessageSquare,
  Shield,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

const KIND_META: Record<string, { icon: LucideIcon; className: string }> = {
  gift: { icon: Gift, className: 'text-[var(--color-bilibili)]' },
  guard: { icon: Shield, className: 'text-violet-400' },
  superchat: { icon: Zap, className: 'text-amber-400' },
  enter: { icon: DoorOpen, className: 'text-[var(--color-muted)]' },
  follow: { icon: UserPlus, className: 'text-sky-400' },
  like: { icon: Heart, className: 'text-pink-400' },
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
    <ul className={cn('flex flex-col gap-1 overflow-y-auto', className)}>
      {items.map((item, index) => {
        const meta = KIND_META[item.kind]
        const Icon = meta?.icon ?? MessageSquare
        const brand =
          item.platform === 'bilibili' ? 'var(--color-bilibili)' : 'var(--color-xiaohongshu)'
        return (
          <li
            key={`${item.at}-${item.user}-${index}`}
            className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-hover)]"
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: brand }} />
            <div className="min-w-0">
              <span className="text-[11px] text-[var(--color-muted)]">{item.user}</span>
              <p className="flex items-center gap-1.5 truncate text-sm text-[var(--color-fg)]">
                <Icon size={13} strokeWidth={2} className={cn('shrink-0', meta?.className)} />
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
