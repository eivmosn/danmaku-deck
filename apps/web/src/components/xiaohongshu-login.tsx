import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLiveStore } from '@/stores/live'

/** 小红书：cookie 登录 + 每场开播的 6 位开播码 */
export function XiaohongshuLogin({ loggedIn }: { loggedIn: boolean }) {
  const refresh = useLiveStore((state) => state.refresh)
  const [cookie, setCookie] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const post = async (path: string, body: unknown): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as { ok: boolean; error?: string }
      if (!payload.ok) {
        setMessage(payload.error ?? '操作失败')
        return
      }
      await refresh()
      setMessage(path.includes('code') ? '开播码兑换成功' : '登录成功')
      if (path.includes('code')) setCode('')
      else setCookie('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="粘贴网页版 cookie（含 a1 与 web_session）"
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] p-3 font-mono text-[11px] text-[var(--color-fg)] outline-none focus:border-[var(--color-xiaohongshu)]"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || cookie.trim().length < 10}
          onClick={() => void post('/api/platforms/xiaohongshu/login', { cookie: cookie.trim() })}
        >
          <LogIn size={14} />
          {loggedIn ? '更换 cookie' : '用 cookie 登录'}
        </Button>
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 位开播码"
          inputMode="numeric"
          className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 font-mono text-sm tracking-widest text-[var(--color-fg)] outline-none focus:border-[var(--color-xiaohongshu)]"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || code.length !== 6 || !loggedIn}
          onClick={() => void post('/api/platforms/xiaohongshu/code', { code })}
        >
          <KeyRound size={14} />
          兑换
        </Button>
      </div>

      {message ? <p className="text-xs text-[var(--color-muted)]">{message}</p> : null}
    </div>
  )
}
