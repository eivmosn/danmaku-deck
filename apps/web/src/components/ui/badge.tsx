import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'bilibili' | 'xiaohongshu' | 'success'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/10 text-white/70',
  bilibili: 'bg-[var(--color-bilibili)]/20 text-[var(--color-bilibili)]',
  xiaohongshu: 'bg-[var(--color-xiaohongshu)]/20 text-[var(--color-xiaohongshu)]',
  success: 'bg-emerald-400/15 text-emerald-300',
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
