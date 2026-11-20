import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
        <Textarea
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="粘贴网页版 cookie（含 a1 与 web_session）"
          rows={2}
          className="w-full resize-none font-mono text-[11px]"
        />
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={busy || cookie.trim().length < 10}
          onClick={() => void post('/api/platforms/xiaohongshu/login', { cookie: cookie.trim() })}
        >
          <LogIn size={14} />
          {loggedIn ? '更换 cookie' : '用 cookie 登录'}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 位开播码"
          inputMode="numeric"
          className="flex-1 font-mono tracking-widest"
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

      {message ? <p className="text-xs text-[var(--muted-foreground)]">{message}</p> : null}
    </div>
  )
}
