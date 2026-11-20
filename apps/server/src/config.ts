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
  /** DNS 劫持端口；53 需要 root，调试可用 5353 */
  dnsPort: z.coerce.number().int().positive().default(53),
  /** DNS 绑定地址：NAS 上自带 dnsmasq 占了 0.0.0.0:53，绑具体网卡 IP 才不冲突 */
  dnsHost: z.string().default('0.0.0.0'),
  /** 被劫持的域名指向哪个 IP（一般是 NAS 自己） */
  dnsHijackIp: z.string().default('127.0.0.1'),
  /** 关闭内置 DNS（比如继续用 dnsmasq） */
  dnsEnabled: z.coerce.boolean().default(false),
  /** 内置 TLS 中继（替代 twitch-relay 容器） */
  relayEnabled: z.coerce.boolean().default(false),
  relayPort: z.coerce.number().int().positive().default(18443),
  /** 代理地址与端口，mihomo 的混合端口 */
  proxyHost: z.string().default('127.0.0.1'),
  proxyPort: z.coerce.number().int().positive().default(7890),
  /** mihomo 控制接口 */
  mihomoUrl: z.string().default('http://127.0.0.1:9090'),
  mihomoGroup: z.string().default('AUTO'),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    host: env.PS5LB_HOST,
    port: env.PS5LB_PORT,
    logLevel: env.PS5LB_LOG_LEVEL,
    ircPort: env.PS5LB_IRC_PORT,
    rtmpPort: env.PS5LB_RTMP_PORT,
    dnsPort: env.PS5LB_DNS_PORT,
    dnsHost: env.PS5LB_DNS_HOST,
    dnsHijackIp: env.PS5LB_DNS_IP,
    dnsEnabled: env.PS5LB_DNS_ENABLED,
    relayEnabled: env.PS5LB_RELAY_ENABLED,
    relayPort: env.PS5LB_RELAY_PORT,
    proxyHost: env.PS5LB_PROXY_HOST,
    proxyPort: env.PS5LB_PROXY_PORT,
    mihomoUrl: env.PS5LB_MIHOMO_URL,
    mihomoGroup: env.PS5LB_MIHOMO_GROUP,
  })
}
