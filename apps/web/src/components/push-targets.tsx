import type { Platform } from '@ps5lb/shared'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface TargetRow {
  platform: Platform
  server: string
  hasKey: boolean
}

const LABEL: Record<Platform, string> = { bilibili: '哔哩哔哩', xiaohongshu: '小红书' }

/** 推流地址：正式接入平台接口前，先支持手动填写验证整条链路 */
export function PushTargets() {
  const [rows, setRows] = useState<TargetRow[]>([])
  const [server, setServer] = useState<Record<Platform, string>>({
    bilibili: '',
    xiaohongshu: '',
  })
  const [key, setKey] = useState<Record<Platform, string>>({ bilibili: '', xiaohongshu: '' })
  const [message, setMessage] = useState('')

  const load = async (): Promise<void> => {
    const response = await fetch('/api/push/targets')
    if (!response.ok) return
    const body = (await response.json()) as { targets: TargetRow[] }
    setRows(body.targets)
    const nextServer = { bilibili: '', xiaohongshu: '' } as Record<Platform, string>
    for (const row of body.targets) nextServer[row.platform] = row.server
    setServer(nextServer)
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async (platform: Platform): Promise<void> => {
    setMessage('')
    const response = await fetch(`/api/push/targets/${platform}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: server[platform], key: key[platform] }),
    })
    if (!response.ok) {
      setMessage('保存失败，检查地址和密钥')
      return
    }
    setKey({ ...key, [platform]: '' })
    setMessage(`${LABEL[platform]} 推流地址已保存`)
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      {(['bilibili', 'xiaohongshu'] as Platform[]).map((platform) => {
        const configured = rows.find((row) => row.platform === platform)
        return (
          <div key={platform} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-fg)]">{LABEL[platform]}</span>
              <span className="text-[11px] text-[var(--color-muted)]">
                {configured ? '已配置' : '未配置'}
              </span>
            </div>
            <input
              value={server[platform]}
              onChange={(event) => setServer({ ...server, [platform]: event.target.value })}
              placeholder="rtmp://…/live"
              className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 font-mono text-xs text-[var(--color-fg)] outline-none focus:border-[var(--color-bilibili)]"
            />
            <div className="flex gap-2">
              <input
                value={key[platform]}
                onChange={(event) => setKey({ ...key, [platform]: event.target.value })}
                placeholder={configured?.hasKey ? '已保存，留空则不修改' : '推流密钥'}
                type="password"
                className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 font-mono text-xs text-[var(--color-fg)] outline-none focus:border-[var(--color-bilibili)]"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void save(platform)}
                disabled={!server[platform] || !key[platform]}
              >
                保存
              </Button>
            </div>
          </div>
        )
      })}
      {message ? <p className="text-xs text-[var(--color-muted)]">{message}</p> : null}
    </div>
  )
}
