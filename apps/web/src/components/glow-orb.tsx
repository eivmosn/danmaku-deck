import { motion } from 'motion/react'

interface GlowOrbProps {
  color: string
  size?: number
  /** 光球亮度，LIVE 时更亮 */
  intensity?: number
}

/**
 * AI 光球：球心 + 旋转高光 + 外发光 + 漂浮微粒，纯 CSS 渐变 + motion 组合，
 * 不依赖 WebGL，暗色下最出效果。
 */
export function GlowOrb({ color, size = 64, intensity = 1 }: GlowOrbProps) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      {/* 外发光：呼吸 */}
      <motion.div
        className="absolute inset-[-45%] rounded-full blur-2xl"
        style={{ background: color, opacity: 0.25 * intensity }}
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.22 * intensity, 0.38 * intensity, 0.22 * intensity],
        }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 球体 */}
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${color} 25%, white) 0%, ${color} 42%, color-mix(in srgb, ${color} 55%, black) 100%)`,
          boxShadow: `inset -4px -6px 14px rgb(0 0 0 / 0.35), inset 3px 4px 10px rgb(255 255 255 / 0.28)`,
        }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* 旋转高光 */}
        <motion.div
          className="absolute inset-[-30%] rounded-full opacity-70"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, rgb(255 255 255 / 0.55) 60deg, transparent 130deg, transparent 360deg)`,
            filter: 'blur(6px)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
        />
        {/* 顶部反光 */}
        <div
          className="absolute left-[18%] top-[12%] h-[28%] w-[42%] rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, #fff 0%, transparent 70%)',
            filter: 'blur(3px)',
          }}
        />
      </motion.div>

      {/* 漂浮微粒 */}
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="absolute rounded-full"
          style={{
            width: 3 + index,
            height: 3 + index,
            background: color,
            left: `${20 + index * 28}%`,
            top: `${70 - index * 18}%`,
            opacity: 0.5,
          }}
          animate={{ y: [0, -10 - index * 4, 0], opacity: [0.15, 0.6, 0.15] }}
          transition={{
            duration: 3 + index,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.5,
          }}
        />
      ))}
    </div>
  )
}
