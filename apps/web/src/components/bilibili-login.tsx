import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLiveStore } from '@/stores/live'

type Phase = 'idle' | 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

interface StartResponse {
  ok: boolean
  key?: string
  url?: string
  error?: string
}

interface PollResponse {
  ok: boolean
  state?: string
  message?: string
  error?: string
}

export function BilibiliLogin({ loggedIn }: { loggedIn: boolean }) {
  const refresh = useLiveStore((state) => state.refresh)
  const [phase, setPhase] = useState<Phase>('idle')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [message, setMessage] = useState('')
  const timer = useRef<number | null>(null)

  const stopPolling = (): void => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }

  useEffect(() => stopPolling, [])

  const start = async (): Promise<void> => {
    stopPolling()
    setPhase('loading')
    setMessage('')
    try {
      const response = await fetch('/api/platforms/bilibili/login/qr', { method: 'POST' })
      const body = (await response.json()) as StartResponse
      if (!body.ok || !body.key || !body.url) throw new Error(body.error ?? '取二维码失败')
      setKey(body.key)
      setUrl(body.url)
      setPhase('waiting')
    } catch (error) {
      setPhase('error')
      setMessage(error instanceof Error ? error.message : '取二维码失败')
    }
  }

  // 拿到 key 之后每 2 秒轮询一次
  useEffect(() => {
    if (!key) return
    stopPolling()
    timer.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/platforms/bilibili/login/qr/${key}`)
        const body = (await response.json()) as PollResponse
        if (body.state === 'scanned') setPhase('scanned')
        if (body.state === 'expired') {
          stopPolling()
          setPhase('expired')
          setMessage('二维码已过期，请重新生成')
        }
        if (body.state === 'success') {
          stopPolling()
          setPhase('success')
          setMessage('登录成功')
          setKey('')
          await refresh()
        }
      } catch {
        // 单次失败不打断轮询
      }
    }, 2000)
    return stopPolling
  }, [key, refresh])

  const busy = phase === 'loading' || phase === 'waiting' || phase === 'scanned'

  return (
    <div className="flex flex-col gap-3">
      {url && busy ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-4">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={url} size={148} />
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            {phase === 'scanned' ? '已扫码，请在手机上确认' : '用哔哩哔哩 App 扫码'}
          </p>
        </div>
      ) : null}

      {phase === 'success' ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-300">登录成功，账号已保存</p>
      ) : null}
      {phase === 'expired' || phase === 'error' ? (
        <p className="text-xs text-red-600 dark:text-red-400">{message}</p>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void start()}
          disabled={phase === 'loading'}
        >
          {url ? <RotateCw size={14} /> : <QrCode size={14} />}
          {url ? '重新生成' : phase === 'loading' ? '生成中…' : loggedIn ? '更换账号' : '扫码登录'}
        </Button>
      </div>
    </div>
  )
}
