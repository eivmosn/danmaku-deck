import { z } from 'zod'

/** 服务端配置：全部来自环境变量，缺省值适合 NAS 本地部署 */
export const configSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(8787),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** PS5 聊天窗口连的端口 */
  ircPort: z.coerce.number().int().positive().default(6667),
  /** mediamtx 的 RTMP 端口，推流从这里拉 */
  rtmpPort: z.coerce.number().int().positive().default(1935),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    host: env.PS5LB_HOST,
    port: env.PS5LB_PORT,
    logLevel: env.PS5LB_LOG_LEVEL,
    ircPort: env.PS5LB_IRC_PORT,
    rtmpPort: env.PS5LB_RTMP_PORT,
  })
}
