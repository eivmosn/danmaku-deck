import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveStore } from '@/stores/live'

const PENDING: Array<{ title: string; desc: string; stage: string }> = [
  { title: 'B 站账号', desc: '扫码登录、直播间信息、开播开关', stage: 'P2' },
  { title: '小红书账号', desc: 'Cookie 维护、开播码、直播间号', stage: 'P2' },
  { title: '直播信息', desc: '标题与分区（B 站开放接口）', stage: 'P3' },
  { title: 'Twitch 代理', desc: '节点状态、切换、订阅更新', stage: 'P4' },
  { title: '多账号', desc: '同平台多账号切换', stage: 'P6' },
]

export function SettingsPage() {
  const serverUrl = useLiveStore((state) => state.serverUrl)

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">设置</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">服务地址、接入进度与版本信息</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">服务地址</CardTitle>
        </CardHeader>
        <CardContent className="font-mono text-xs text-[var(--color-fg)]">{serverUrl}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">接入进度</CardTitle>
          <span className="text-[11px] text-[var(--color-muted)]">按阶段实现</span>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-[var(--color-border)]">
          {PENDING.map((item) => (
            <div key={item.title} className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-sm text-[var(--color-fg)]">{item.title}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{item.desc}</div>
              </div>
              <span className="rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                {item.stage}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">关于</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-[var(--color-muted)]">
          PS5 Live Bridge · 把 PS5 直播推到 B 站与小红书，并把两边弹幕送回 PS5 屏幕
        </CardContent>
      </Card>
    </div>
  )
}
