import { BilibiliLogin } from '@/components/bilibili-login'
import { PushTargets } from '@/components/push-targets'
import { XiaohongshuLogin } from '@/components/xiaohongshu-login'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveStore } from '@/stores/live'

export function SettingsPage() {
  const serverUrl = useLiveStore((state) => state.serverUrl)
  const status = useLiveStore((state) => state.status)
  const bilibili = status?.platforms.find((item) => item.platform === 'bilibili')
  const xiaohongshu = status?.platforms.find((item) => item.platform === 'xiaohongshu')
  const logout = useLiveStore((state) => state.logout)

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">设置</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          服务地址、账号、推流与版本信息
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">服务地址</CardTitle>
        </CardHeader>
        <CardContent className="font-mono text-xs text-[var(--foreground)]">
          {serverUrl}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">哔哩哔哩账号</CardTitle>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {bilibili?.accountName ?? '未登录'}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {bilibili?.accountName ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--foreground)]">{bilibili.accountName}</span>
              <Button variant="ghost" size="sm" onClick={() => void logout('bilibili')}>
                退出登录
              </Button>
            </div>
          ) : (
            <span className="text-xs text-[var(--muted-foreground)]">还没有登录</span>
          )}
          <BilibiliLogin loggedIn={Boolean(bilibili?.accountName)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">小红书账号</CardTitle>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {xiaohongshu?.accountName ?? '未登录'}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {xiaohongshu?.accountName ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--foreground)]">{xiaohongshu.accountName}</span>
              <Button variant="ghost" size="sm" onClick={() => void logout('xiaohongshu')}>
                退出登录
              </Button>
            </div>
          ) : (
            <span className="text-xs text-[var(--muted-foreground)]">还没有登录</span>
          )}
          <XiaohongshuLogin loggedIn={Boolean(xiaohongshu?.accountName)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">推流地址</CardTitle>
          <span className="text-[11px] text-[var(--muted-foreground)]">平台接口接入前手动填写</span>
        </CardHeader>
        <CardContent>
          <PushTargets />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">关于</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-[var(--muted-foreground)]">
          PS5 Live Bridge · 把 PS5 直播推到 B 站与小红书，并把两边弹幕送回 PS5 屏幕
        </CardContent>
      </Card>
    </div>
  )
}
