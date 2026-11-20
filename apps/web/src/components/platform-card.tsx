import type { Platform } from '@ps5lb/shared'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Switch } from './ui/switch'

const META: Record<Platform, { name: string; tone: 'bilibili' | 'xiaohongshu'; color: string }> = {
  bilibili: { name: '哔哩哔哩', tone: 'bilibili', color: 'var(--color-bilibili)' },
  xiaohongshu: { name: '小红书', tone: 'xiaohongshu', color: 'var(--color-xiaohongshu)' },
}

export interface PlatformCardProps {
  platform: Platform
  enabled: boolean
  accountName: string | null
  live: boolean
  onToggle: () => void
}

export function PlatformCard({
  platform,
  enabled,
  accountName,
  live,
  onToggle,
}: PlatformCardProps) {
  const meta = META[platform]
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-[4px]"
            style={{ background: meta.color }}
          />
          <CardTitle>{meta.name}</CardTitle>
        </div>
        {live ? <Badge tone="success">直播中</Badge> : <Badge>未开播</Badge>}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <span>{accountName ?? '未登录'}</span>
        <Switch label="开播时推送" checked={enabled} onCheckedChange={onToggle} />
      </CardContent>
    </Card>
  )
}
