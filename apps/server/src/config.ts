import { z } from 'zod'

/** 服务端配置：全部来自环境变量，缺省值适合 NAS 本地部署 */
export const configSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(8787),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    host: env.PS5LB_HOST,
    port: env.PS5LB_PORT,
    logLevel: env.PS5LB_LOG_LEVEL,
  })
}
