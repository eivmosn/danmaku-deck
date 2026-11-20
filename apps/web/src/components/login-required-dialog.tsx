import type { Platform } from '@ps5lb/shared'
import { LogIn } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'

const META = {
  bilibili: {
    name: '哔哩哔哩',
    color: 'var(--bilibili)',
    hint: '需要用哔哩哔哩 App 扫码登录，登录后开关才会生效。',
  },
  xiaohongshu: {
    name: '小红书',
    color: 'var(--xiaohongshu)',
    hint: '需要粘贴网页版 cookie，并输入每场的 6 位开播码。',
  },
} as const

interface LoginRequiredDialogProps {
  platform: Platform | null
  onClose: () => void
}

/** 没登录时点开关 → 用官方 Dialog 结构引导登录 */
export function LoginRequiredDialog({ platform, onClose }: LoginRequiredDialogProps) {
  const navigate = useNavigate()
  const meta = platform ? META[platform] : null

  return (
    <Dialog open={platform !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>先登录{meta?.name}</DialogTitle>
          <DialogDescription>登录后才能把画面推到这个平台。</DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-4">
          <p className="text-sm text-muted-foreground">{meta?.hint}</p>
        </DialogPanel>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>稍后</DialogClose>
          <Button
            onClick={() => {
              onClose()
              navigate('/settings')
            }}
          >
            <LogIn />
            去登录
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
