import { z } from 'zod'

/** 支持直播的平台 */
export const platformSchema = z.enum(['bilibili', 'xiaohongshu'])
export type Platform = z.infer<typeof platformSchema>

/** 直播状态机 */
export const liveStateSchema = z.enum(['idle', 'starting', 'live', 'stopping', 'error'])
export type LiveState = z.infer<typeof liveStateSchema>

/** 单个平台的状态 */
export const platformStatusSchema = z.object({
  platform: platformSchema,
  enabled: z.boolean(),
  accountName: z.string().nullable(),
  live: z.boolean(),
  error: z.string().nullable(),
})
export type PlatformStatus = z.infer<typeof platformStatusSchema>

/** 对外暴露的整体状态 */
export const statusSchema = z.object({
  state: liveStateSchema,
  uptimeSeconds: z.number().int().nonnegative(),
  platforms: z.array(platformStatusSchema),
  /** 当前从 PS5 收进来的流路径，未开播为空 */
  streamPath: z.string().nullable(),
  updatedAt: z.string(),
})
export type Status = z.infer<typeof statusSchema>

/** 弹幕事件类型 */
export const danmakuKindSchema = z.enum([
  'chat',
  'gift',
  'guard',
  'superchat',
  'enter',
  'follow',
  'like',
])
export type DanmakuKind = z.infer<typeof danmakuKindSchema>

/** 一条弹幕事件（两平台统一格式） */
export const danmakuEventSchema = z.object({
  platform: platformSchema,
  kind: danmakuKindSchema,
  user: z.string(),
  text: z.string(),
  count: z.number().int().nonnegative().default(0),
  at: z.string(),
})
export type DanmakuEvent = z.infer<typeof danmakuEventSchema>
