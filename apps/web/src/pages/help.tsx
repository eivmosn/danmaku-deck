import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS: Array<{ title: string; lines: string[] }> = [
  {
    title: '1. 记下 NAS 的局域网地址',
    lines: [
      '在设置页顶部能看到服务地址，形如 http://192.168.1.100:8787',
      '要填进 PS5 的是其中那个 IP：192.168.1.100',
    ],
  },
  {
    title: '2. PS5 上把 DNS 指到 NAS',
    lines: [
      '设定 → 网络 → 设定互联网连接 → 选当前 Wi-Fi → 高级设置',
      'DNS 设置 → 手动',
      '主要 DNS：填 NAS 的 IP（例如 192.168.1.100）',
      '次要 DNS：留空，或填 223.5.5.5 作兜底',
      '其余选项保持「自动」不变',
    ],
  },
  {
    title: '3. 测试连接',
    lines: [
      '设定 → 网络 → 测试互联网连接',
      '这一步会让 PS5 重新解析域名，新的 DNS 才会生效',
      '测试通过即可',
    ],
  },
  {
    title: '4. 开始直播',
    lines: [
      '打开要播的游戏，按手柄的创建键（截图键左边那个）',
      '选择「直播」→ 选 Twitch → 开始直播',
      '面板首页出现「正在推流」就说明链路通了',
    ],
  },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: '为什么要把 DNS 指到 NAS？',
    a: 'PS5 只会往 Twitch 推流。把 twitch 相关域名解析到 NAS，PS5 的推流和聊天连接就会落到我们的服务上，再由服务转发到 B 站和小红书，并把弹幕送回 PS5 屏幕。',
  },
  {
    q: '改了 DNS 会不会影响别的功能？',
    a: '只有 twitch.tv、live-video.net 这些域名被劫持，其他网站的查询会转发给上游 DNS，日常上网不受影响。',
  },
  {
    q: '面板一直显示「未开播」？',
    a: '确认 PS5 的 DNS 指向 NAS，并做过一次「测试互联网连接」。也可以在日志页看有没有「检测到 PS5 开始推流」。',
  },
  {
    q: 'PS5 显示直播已开始，但 B 站看不到？',
    a: '看面板开播后有没有黄色提示卡：多半是平台没登录或开关没打开。登录后要打开对应的「开播时推送」开关。',
  },
  {
    q: 'NAS 换了 IP 怎么办？',
    a: '在路由器里给 NAS 做静态 IP 绑定更省事。若已经变了，改 PS5 的 DNS 指向新的 IP 即可。',
  },
]

export function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">帮助</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          第一次使用，按这几步设置 PS5 即可
        </p>
      </header>

      {STEPS.map((step) => (
        <Card key={step.title}>
          <CardHeader>
            <CardTitle className="text-sm">{step.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {step.lines.map((line) => (
              <p key={line} className="text-[13px] leading-relaxed">
                {line}
              </p>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">常见问题</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-[var(--border)]">
          {FAQ.map((item) => (
            <div key={item.q} className="py-2.5">
              <p className="text-[13px] font-medium text-[var(--foreground)]">{item.q}</p>
              <p className="mt-1 text-[13px] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">注意</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] leading-relaxed">
          菜单名称可能因 PS5 系统版本略有差异，路径基本一致：网络 → 设定互联网连接 → 高级设置 → DNS
          设置。
        </CardContent>
      </Card>
    </div>
  )
}
