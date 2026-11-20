import type { Platform, PlatformStatus } from '@ps5lb/shared'
import { BilibiliLogo, XiaohongshuLogo } from '@/components/brand-logos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const META: Record<Platform, { name: string; color: string }> = {
  bilibili: { name: '哔哩哔哩', color: 'var(--bilibili)' },
  xiaohongshu: { name: '小红书', color: 'var(--xiaohongshu)' },
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
            className="inline-flex items-center justify-center rounded-[10px] p-3 text-white"
            style={{ backgroundColor: meta.color, opacity: 0.92 }}
          >
            {platform === 'bilibili' ? <BilibiliLogo size={26} /> : <XiaohongshuLogo size={26} />}
          </span>
          <div className="leading-tight">
            <CardTitle className="text-sm">{meta.name}</CardTitle>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              {status?.accountName ?? '未登录'}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px]"
          style={{
            color: enabled ? meta.color : 'var(--muted-foreground)',
            background: enabled ? `${meta.color}1f` : 'var(--muted)',
          }}
        >
          {enabled ? '已启用' : '已停用'}
        </span>
      </CardHeader>

      <CardContent className="flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[11px] text-[var(--muted-foreground)]">开播时推送</span>
        <Switch aria-label={`${meta.name}推送`} checked={enabled} onCheckedChange={onToggle} />
      </CardContent>
    </Card>
  )
}
