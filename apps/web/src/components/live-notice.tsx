import { Link } from 'react-router'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { LiveSignal } from '@/components/live-signal'
import type { Status } from '@ps5lb/shared'

interface LiveNoticeProps {
  status: Status | null
}

const LABEL = { bilibili: '哔哩哔哩', xiaohongshu: '小红书' } as const

/**
 * 开播时的状态卡片：
 * - 有分发目标 → 绿色，说明正在推到哪
 * - 没有 → 黄色，明确说明为什么观众看不到
 */
export function LiveNotice({ status }: LiveNoticeProps) {
  if (!status || status.state !== 'live') return null

  const platforms = status.platforms
  const pushing = platforms.filter((item) => item.enabled && item.accountName)
  const enabledWithoutAccount = platforms.filter((item) => item.enabled && !item.accountName)
  const loggedIn = platforms.filter((item) => item.accountName)

  if (pushing.length > 0) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-4">
        <LiveSignal color="#10b981" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-[var(--color-fg)]">正在推流</p>
          <p className="mt-1 truncate text-[var(--color-muted)]">
            {pushing.map((item) => LABEL[item.platform]).join(' · ')} · 收流路径 {status.streamPath}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-300">
          LIVE
        </span>
      </div>
    )
  }

  const reason = (() => {
    if (loggedIn.length === 0) return '还没有登录任何平台，画面只会进到 NAS，观众看不到'
    if (enabledWithoutAccount.length > 0) {
      return `${enabledWithoutAccount.map((item) => LABEL[item.platform]).join('、')} 还没登录，这一路不会推流`
    }
    return '两个平台的开关都关着，画面不会分发出去'
  })()

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
      <LiveSignal color="#f59e0b" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle size={12} />
          已接收画面
        </span>
        <p className="font-medium text-[var(--color-fg)]">PS5 正在推流，但没有分发目标</p>
        <p className="mt-1 text-[var(--color-muted)]">{reason}</p>
        <Link
          to="/settings"
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          <Sparkles size={13} />
          去设置登录账号
        </Link>
      </div>
    </div>
  )
}
