import type { Status } from '@ps5lb/shared'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'

const LABEL = { bilibili: '哔哩哔哩', xiaohongshu: '小红书' } as const

/** 60 根电平条，各自不同的幅度与节奏，看起来像真实的音频波形 */
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
          initial={{ height: bar.base, opacity: 0.45 }}
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
  const raw = useMotionValue(0)
  const spring = useSpring(raw, { stiffness: 90, damping: 18 })
  const text = useTransform(spring, (value) => {
    const total = Math.max(0, Math.floor(value))
    const minutes = Math.floor(total / 60)
    return `${minutes}:${String(total % 60).padStart(2, '0')}`
  })
  raw.set(seconds)
  return <motion.span className="tabular-nums">{text}</motion.span>
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
      className="relative overflow-hidden rounded-2xl border bg-[var(--color-surface)]/70 p-4 backdrop-blur-sm"
      style={{ borderColor: active ? 'rgb(16 185 129 / 0.35)' : 'rgb(245 158 11 / 0.35)' }}
    >
      {/* 缓慢流动的极光背景 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 140% at 12% 0%, ${color}26 0%, transparent 55%),
                       radial-gradient(90% 120% at 85% 100%, ${color}1f 0%, transparent 60%)`,
        }}
        animate={{ backgroundPosition: ['0% 0%', '100% 60%', '0% 0%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <motion.span
              className="absolute inline-flex size-full rounded-full"
              style={{ background: color }}
              animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
            <span
              className="relative inline-flex size-2.5 rounded-full"
              style={{ background: color }}
            />
          </span>
          <span className="text-sm font-semibold text-[var(--color-fg)]">
            {active ? '正在推流' : '已接收画面'}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${color}1f`, color }}
          >
            {active ? 'LIVE' : '仅本地'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <Waveform color={color} />
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-[var(--color-muted)]">
            时长{' '}
            <span className="text-[var(--color-fg)]">
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
                    color:
                      item.platform === 'bilibili'
                        ? 'var(--color-bilibili)'
                        : 'var(--color-xiaohongshu)',
                    background:
                      item.platform === 'bilibili'
                        ? 'color-mix(in srgb, var(--color-bilibili) 15%, transparent)'
                        : 'color-mix(in srgb, var(--color-xiaohongshu) 15%, transparent)',
                  }}
                >
                  {LABEL[item.platform]}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部流动光带 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
        animate={{ x: ['-40%', '40%', '-40%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {active ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--color-border)] pt-3 text-[13px]">
          <AlertTriangle size={14} style={{ color }} />
          <span className="text-[var(--color-muted)]">{reason}，观众看不到</span>
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
    </motion.section>
  )
}
