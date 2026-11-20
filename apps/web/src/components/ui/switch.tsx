import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { useId, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, 'className'> {
  label?: string
  className?: string
}

export function Switch({ label, className, ...props }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BaseSwitch.Root
        id={id}
        className={cn(
          'group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
          'bg-[var(--color-elevated)] transition-colors data-[checked]:bg-[var(--color-bilibili)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--color-bilibili)]/50 focus-visible:outline-none',
        )}
        {...props}
      >
        <BaseSwitch.Thumb
          className={cn(
            'block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform',
            'group-data-[checked]:translate-x-[22px]',
          )}
        />
      </BaseSwitch.Root>
      {label ? (
        <label htmlFor={id} className="cursor-pointer text-sm text-[var(--color-muted)]">
          {label}
        </label>
      ) : null}
    </div>
  )
}
