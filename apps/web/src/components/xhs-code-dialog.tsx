import { useState } from 'react'
import { KeyRound, Smartphone } from 'lucide-react'
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
import { Input } from '@/components/ui/input'

interface XhsCodeDialogProps {
  open: boolean
  onClose: () => void
  /** 兑换成功后调用：把开关真正打开 */
  onDone: () => void
}

/**
 * 打开小红书开关时必弹：小红书每场都要用手机上的 6 位开播码换推流地址，
 * 忘了兑换就会推到一个过期的地址上，表现是「推不进去」。
 */
export function XhsCodeDialog({ open, onClose, onDone }: XhsCodeDialogProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (code.length !== 6) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/platforms/xiaohongshu/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const payload = (await response.json()) as { ok: boolean; error?: string }
      if (!payload.ok) {
        setError(payload.error ?? '兑换失败')
        return
      }
      setCode('')
      onDone()
      onClose()
    } catch {
      setError('网络错误，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCode('')
          setError('')
          onClose()
        }
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>先兑换开播码</DialogTitle>
          <DialogDescription>小红书每场直播都要用一个新的开播码。</DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-4">
          <ol className="grid gap-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0" />
              在小红书手机端点「开始直播」，选择电脑直播，拿到 6 位开播码。
            </li>
            <li className="flex gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              把开播码填在下面，兑换成功后再回到手机上点一次「开始直播」。
            </li>
          </ol>

          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位开播码"
            inputMode="numeric"
            autoFocus
            className="h-10 text-center font-mono text-lg tracking-[0.4em]"
          />

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogPanel>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>取消</DialogClose>
          <Button disabled={busy || code.length !== 6} onClick={() => void submit()}>
            兑换并开播
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
