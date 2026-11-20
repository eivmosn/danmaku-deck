import { useElapsedSeconds } from '@/lib/use-elapsed'
import type { Status } from '@danmaku-deck/shared'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { GlowOrb } from '@/components/glow-orb'
import { Link } from 'react-router'

const LABEL = { bilibili: '哔哩哔哩', xiaohongshu: '小红书' } as const

const BARS = Array.from({ length: 56 }, (_, index) => ({
  base: 6 + ((index * 7) % 22),
  peak: 18 + ((index * 13) % 26),
  delay: (index % 11) * 0.075,
  duration: 0.9 + ((index * 3) % 7) * 0.09,
}))

function Waveform({ color }: { color: string }) {
  return (
    <div className="flex h-14 items-center gap-[3px]" aria-hidden>
      {BARS.map((bar, index) => (
        <motion.span
          key={index}
          className="w-[3px] rounded-full"
          style={{ background: color }}
          initial={{ height: bar.base, opacity: 0.5 }}
          animate={{ height: [bar.base, bar.peak, bar.base * 0.7, bar.peak * 0.85, bar.base] }}
          transition={{
            duration: bar.duration,
            delay: bar.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

function Uptime({ seconds }: { seconds: number }) {
  const total = useElapsedSeconds(seconds)
  return (
    <span className="tabular-nums">
      {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}
    </span>
  )
}

/** 暗色下的弥散光晕：两团模糊光斑缓慢游走 */
function Glow({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-2xl dark:block">
      <motion.div
        className="absolute -left-16 -top-24 size-64 rounded-full blur-3xl"
        style={{ background: color, opacity: 0.28 }}
        animate={{ x: [0, 40, -12, 0], y: [0, 18, 34, 0], scale: [1, 1.18, 0.94, 1] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-24 right-0 size-72 rounded-full blur-3xl"
        style={{ background: color, opacity: 0.18 }}
        animate={{ x: [0, -50, 20, 0], y: [0, -24, -8, 0], scale: [1, 0.9, 1.12, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

export function LivePanel({ status }: { status: Status | null }) {
  if (!status || status.state !== 'live') return null

  const pushing = status.platforms.filter((item) => item.enabled && item.accountName)
  const loggedIn = status.platforms.filter((item) => item.accountName)
  const active = pushing.length > 0
  const color = active ? '#10b981' : '#f59e0b'

  const reason = (() => {
    if (loggedIn.length === 0) return '还没有登录任何平台，画面只会进到 NAS'
    if (pushing.length < status.platforms.filter((item) => item.enabled).length) {
      return '有平台开了开关但没登录，这一路不会推流'
    }
    return '两个平台的开关都关着，画面不会分发出去'
  })()

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className={[
        'relative overflow-hidden rounded-2xl border p-4 shadow-sm',
        active
          ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-50 via-white to-white dark:border-emerald-500/35 dark:from-emerald-500/10 dark:via-[var(--card)] dark:to-[var(--card)] dark:shadow-none'
          : 'border-amber-500/40 bg-gradient-to-br from-amber-50 via-white to-white dark:border-amber-500/35 dark:from-amber-500/10 dark:via-[var(--card)] dark:to-[var(--card)] dark:shadow-none',
      ].join(' ')}
    >
      <Glow color={color} />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-3">
          <GlowOrb color={color} size={44} intensity={active ? 1 : 0.75} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {active ? '正在推流' : '已接收画面'}
            </span>
            <span
              className="mt-1 w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
              style={{ background: `${color}22`, color }}
            >
              {active ? 'LIVE' : '仅本地'}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Waveform color={color} />
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-[var(--muted-foreground)]">
            时长{' '}
            <span className="text-[var(--foreground)]">
              <Uptime seconds={status.uptimeSeconds} />
            </span>
          </div>
          {active ? (
            <div className="flex gap-1.5">
              {pushing.map((item) => (
                <span
                  key={item.platform}
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{
                    color: item.platform === 'bilibili' ? 'var(--bilibili)' : 'var(--xiaohongshu)',
                    background: `color-mix(in srgb, ${item.platform === 'bilibili' ? 'var(--bilibili)' : 'var(--xiaohongshu)'} 14%, transparent)`,
                  }}
                >
                  {LABEL[item.platform]}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {active ? null : (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border)] pt-3 text-[13px]">
          <AlertTriangle size={14} style={{ color }} />
          <span className="text-[var(--muted-foreground)]">{reason}，观众看不到</span>
          <Link
            to="/settings"
            className="inline-flex items-center gap-0.5 font-medium"
            style={{ color }}
          >
            去设置登录
            <ArrowUpRight size={13} />
          </Link>
        </div>
      )}

      {/* 底部流动光带：暗色下更明显 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-40 dark:opacity-90"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        animate={{ x: ['-40%', '40%', '-40%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.section>
  )
}
