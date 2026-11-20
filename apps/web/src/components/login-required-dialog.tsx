import type { Platform } from '@ps5lb/shared'
import { Dialog } from '@base-ui/react/dialog'
import { useNavigate } from 'react-router'
import { LogIn } from 'lucide-react'
import { BilibiliLogo, XiaohongshuLogo } from '@/components/brand-logos'
import { Button } from '@/components/ui/button'

const META = {
  bilibili: {
    name: '哔哩哔哩',
    color: 'var(--color-bilibili)',
    hint: '需要用哔哩哔哩 App 扫码登录',
  },
  xiaohongshu: {
    name: '小红书',
    color: 'var(--color-xiaohongshu)',
    hint: '需要粘贴网页版 cookie，并输入每场的 6 位开播码',
  },
} as const

interface LoginRequiredDialogProps {
  platform: Platform | null
  onClose: () => void
}

/** 没登录时点开关 → 先引导登录，而不是假装打开 */
export function LoginRequiredDialog({ platform, onClose }: LoginRequiredDialogProps) {
  const navigate = useNavigate()
  const meta = platform ? META[platform] : null

  return (
    <Dialog.Root open={platform !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex size-11 items-center justify-center rounded-[10px] text-white"
              style={{ background: meta?.color }}
            >
              {platform === 'xiaohongshu' ? (
                <XiaohongshuLogo size={22} />
              ) : (
                <BilibiliLogo size={22} />
              )}
            </span>
            <div>
              <Dialog.Title className="text-base font-semibold text-[var(--color-fg)]">
                先登录{meta?.name}
              </Dialog.Title>
              <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                登录后才能把画面推到这个平台
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-xl bg-[var(--color-elevated)] px-3 py-2.5 text-[13px] text-[var(--color-muted)]">
            {meta?.hint}
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" size="sm" />}>稍后</Dialog.Close>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onClose()
                navigate('/settings')
              }}
            >
              <LogIn size={14} />
              去登录
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
