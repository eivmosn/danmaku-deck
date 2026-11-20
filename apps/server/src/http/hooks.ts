import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Orchestrator } from '../orchestrator.js'

/**
 * MediaMTX hook 的查询参数。
 * 依据 docs/2-features/19-hooks.md：hook 是「执行命令」，变量以环境变量注入。
 * 我们用 curl 把它们拼成查询参数，因此这里是 path / source_type / source_id。
 */
const hookQuerySchema = z.object({
  path: z.string().min(1),
  source_type: z.string().optional(),
  source_id: z.string().optional(),
})

function parsePath(query: unknown): string | null {
  const parsed = hookQuerySchema.safeParse(query)
  return parsed.success ? parsed.data.path : null
}

export function registerHookRoutes(app: FastifyInstance, orchestrator: Orchestrator): void {
  const onAvailable = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ ok: boolean; state?: string; error?: string }> => {
    const path = parsePath(request.query)
    if (path === null) {
      reply.code(400)
      return { ok: false, error: '缺少 path 参数' }
    }
    orchestrator.streamStarted(path)
    return { ok: true, state: orchestrator.snapshot().state }
  }

  const onUnavailable = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ ok: boolean; state?: string; error?: string }> => {
    const path = parsePath(request.query)
    if (path === null) {
      reply.code(400)
      return { ok: false, error: '缺少 path 参数' }
    }
    orchestrator.streamStopped()
    return { ok: true, state: orchestrator.snapshot().state }
  }

  // MediaMTX 用 curl 直接请求，GET / POST 都接受
  app.route({ method: ['GET', 'POST'], url: '/api/hooks/stream/available', handler: onAvailable })
  app.route({
    method: ['GET', 'POST'],
    url: '/api/hooks/stream/unavailable',
    handler: onUnavailable,
  })
}
