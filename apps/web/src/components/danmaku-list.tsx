import type { DanmakuEvent } from '@danmaku-deck/shared'
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
  gift: { icon: Gift, className: 'text-[var(--bilibili)]' },
  guard: { icon: Shield, className: 'text-violet-400' },
  superchat: { icon: Zap, className: 'text-amber-400' },
  enter: { icon: DoorOpen, className: 'text-[var(--muted-foreground)]' },
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
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        {empty}
      </div>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {items.map((item, index) => {
        const meta = KIND_META[item.kind]
        const Icon = meta?.icon ?? MessageSquare
        const brand = item.platform === 'bilibili' ? 'var(--bilibili)' : 'var(--xiaohongshu)'
        return (
          <li
            key={`${item.at}-${item.user}-${index}`}
            className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--accent)]"
          >
            <span
              className="size-1.5 shrink-0 translate-y-[-2px] rounded-full"
              style={{ background: brand }}
            />
            <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">{item.user}</span>
            <Icon
              size={13}
              strokeWidth={2}
              className={cn('shrink-0 translate-y-[2px]', meta?.className)}
            />
            <span className="min-w-0 flex-1 text-sm text-[var(--foreground)]">
              {item.kind === 'gift' && item.count > 1
                ? `送出 ${item.text} ×${item.count}`
                : item.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
