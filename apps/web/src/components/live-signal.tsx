import { cn } from '@/lib/cn'

interface LiveSignalProps {
  className?: string
  /** 主色，默认品牌粉 */
  color?: string
}

/** 开播中的信号动效：脉冲圆环 + 流动的心跳线 + 电平条 */
export function LiveSignal({ className, color = 'var(--color-bilibili)' }: LiveSignalProps) {
  return (
    <div className={cn('relative flex items-center gap-3', className)}>
      <div className="relative flex size-10 items-center justify-center">
        <span
          className="signal-ring absolute inline-flex size-6 rounded-full"
          style={{ background: color, opacity: 0.4 }}
        />
        <span
          className="signal-ring absolute inline-flex size-6 rounded-full"
          style={{ background: color, opacity: 0.25, animationDelay: '0.8s' }}
        />
        <span
          className="relative inline-flex size-2.5 rounded-full"
          style={{ background: color }}
        />
      </div>

      <svg viewBox="0 0 120 32" className="h-8 w-28 shrink-0" fill="none" aria-hidden>
        <path
          d="M0 16 H18 L24 6 L30 26 L36 12 L42 20 L48 16 H120"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="signal-dash"
          opacity="0.9"
        />
      </svg>

      <div className="flex h-8 items-end gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className="signal-bar w-1 rounded-full"
            style={{
              background: color,
              height: `${8 + (index % 3) * 7}px`,
              animationDelay: `${index * 0.12}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
