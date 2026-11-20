import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--color-fg)] text-[var(--color-bg)] hover:opacity-90',
  secondary:
    'bg-[var(--color-elevated)] text-[var(--color-fg)] hover:brightness-95 dark:hover:brightness-125',
  ghost: 'bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-hover)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  icon: 'size-9 p-0',
}

type BaseButtonProps = ComponentProps<typeof BaseButton>

export interface ButtonProps extends Omit<BaseButtonProps, 'className'> {
  variant?: Variant
  size?: Size
  className?: string
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-bilibili)]/60 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
