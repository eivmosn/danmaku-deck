import type { Platform, PlatformStatus } from '@ps5lb/shared'
import { BilibiliLogo, XiaohongshuLogo } from '@/components/brand-logos'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card'
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
  const loggedIn = Boolean(status?.accountName)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: meta.color }}
          >
            {platform === 'bilibili' ? <BilibiliLogo size={22} /> : <XiaohongshuLogo size={22} />}
          </span>
          <div>
            <CardTitle>{meta.name}</CardTitle>
            <CardDescription>{status?.accountName ?? '未登录'}</CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge variant={enabled ? 'success' : 'outline'}>{enabled ? '已启用' : '已停用'}</Badge>
        </CardAction>
      </CardHeader>

      <CardPanel className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          {loggedIn ? '开播时把画面推到这个平台' : '登录后才能开启推送'}
        </span>
        <Switch aria-label={`${meta.name}推送`} checked={enabled} onCheckedChange={onToggle} />
      </CardPanel>

      <CardFooter className="text-xs text-muted-foreground">
        {loggedIn ? '账号已就绪' : '点击开关会先引导登录'}
      </CardFooter>
    </Card>
  )
}
