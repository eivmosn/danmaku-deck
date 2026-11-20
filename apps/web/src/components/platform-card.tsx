import type { Platform, PlatformStatus } from '@ps5lb/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const META: Record<Platform, { name: string; color: string; letter: string }> = {
  bilibili: { name: '哔哩哔哩', color: 'var(--color-bilibili)', letter: 'B' },
  xiaohongshu: { name: '小红书', color: 'var(--color-xiaohongshu)', letter: '红' },
}

interface PlatformCardProps {
  status: PlatformStatus | undefined
  platform: Platform
  onToggle: (enabled: boolean) => void
}

export function PlatformCard({ status, platform, onToggle }: PlatformCardProps) {
  const meta = META[platform]
  const enabled = status?.enabled ?? false

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader className="mb-0">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex size-8 items-center justify-center rounded-xl text-xs font-semibold text-black"
            style={{ background: meta.color }}
          >
            {meta.letter}
          </span>
          <div className="leading-tight">
            <CardTitle className="text-sm">{meta.name}</CardTitle>
            <div className="text-[11px] text-[var(--color-muted)]">
              {status?.accountName ?? '未登录'}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px]"
          style={{
            color: enabled ? meta.color : 'var(--color-muted)',
            background: enabled ? `${meta.color}22` : 'rgba(255,255,255,0.06)',
          }}
        >
          {enabled ? '已启用' : '已停用'}
        </span>
      </CardHeader>

      <CardContent className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <span className="text-[11px] text-[var(--color-muted)]">开播时推送</span>
        <Switch
          label=""
          aria-label={`${meta.name}推送`}
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </CardContent>
    </Card>
  )
}
