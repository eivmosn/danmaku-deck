import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { useId, type ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, 'className'> {
  label: string
  className?: string
}

/** 平台开关：Base UI 保证键盘与读屏语义 */
export function Switch({ label, className, ...props }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BaseSwitch.Root
        id={id}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
          'bg-white/15 transition-colors data-[checked]:bg-[var(--color-bilibili)]',
          'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none',
        )}
        {...props}
      >
        <BaseSwitch.Thumb
          className={cn(
            'block size-5 translate-x-0.5 rounded-full bg-white transition-transform',
            'data-[checked]:translate-x-[22px]',
          )}
        />
      </BaseSwitch.Root>
      <label htmlFor={id} className="cursor-pointer text-sm text-white/80">
        {label}
      </label>
    </div>
  )
}
