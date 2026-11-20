import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'success' | 'bilibili' | 'xiaohongshu'

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--color-elevated)] text-[var(--color-muted)]',
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  bilibili: 'bg-[var(--color-bilibili)]/15 text-[var(--color-bilibili)]',
  xiaohongshu: 'bg-[var(--color-xiaohongshu)]/15 text-[var(--color-xiaohongshu)]',
}

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: Tone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
