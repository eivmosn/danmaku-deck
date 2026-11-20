import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { LogService } from '@/logger'
import type { MihomoClient } from '@/network/mihomo'

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const nodeSchema = z.object({ name: z.string().min(1) })
const configSchema = z.object({
  yaml: z.string().optional(),
  url: z.string().url().optional(),
})

export interface ProxyDeps {
  mihomo: MihomoClient
  logs: LogService
  /** mihomo 读取的配置文件路径，重载时用 */
  configPath: string
  /** 写入配置的位置，通常是挂载进 mihomo 容器的目录 */
  writePath: string
}

export function registerProxyRoutes(app: FastifyInstance, deps: ProxyDeps): void {
  app.get('/api/proxy/status', async () => {
    try {
      return { ok: true, ...(await deps.mihomo.status()) }
    } catch (error) {
      return { ok: false, error: `连不上代理服务：${reason(error)}` }
    }
  })

  app.post('/api/proxy/node', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = nodeSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { ok: false, error: '缺少节点名' }
    }
    try {
      const ok = await deps.mihomo.selectNode(parsed.data.name)
      deps.logs.write(
        ok ? 'info' : 'error',
        '代理',
        ok ? `已切换节点：${parsed.data.name}` : '切换节点失败',
      )
      if (!ok) {
        reply.code(502)
        return { ok: false, error: '切换失败' }
      }
      return { ok: true }
    } catch (error) {
      deps.logs.write('error', '代理', '切换节点时连不上 mihomo')
      reply.code(502)
      return { ok: false, error: `连不上代理服务：${reason(error)}` }
    }
  })

  app.post('/api/proxy/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = configSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { ok: false, error: '参数不正确' }
    }

    let yaml = (parsed.data.yaml ?? '').trim()
    if (!yaml && parsed.data.url) {
      const response = await fetch(parsed.data.url)
      yaml = (await response.text()).trim()
    }
    if (!yaml.includes('proxies:')) {
      reply.code(400)
      return { ok: false, error: '内容不是 Clash 配置（缺少 proxies:）' }
    }

    mkdirSync(dirname(deps.writePath), { recursive: true })
    writeFileSync(deps.writePath, yaml, { mode: 0o644 })
    try {
      const ok = await deps.mihomo.reload(deps.configPath)
      deps.logs.write(ok ? 'info' : 'error', '代理', ok ? '代理配置已重载' : '代理配置重载失败')
      if (!ok) {
        reply.code(502)
        return { ok: false, error: '重载失败' }
      }
      return { ok: true }
    } catch (error) {
      deps.logs.write('error', '代理', '重载时连不上 mihomo')
      reply.code(502)
      return { ok: false, error: `连不上代理服务：${reason(error)}` }
    }
  })
}
