import { platformSchema } from '@danmaku-deck/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Orchestrator } from '@/orchestrator'
import type { SettingsStore } from '@/settings-store'

const paramsSchema = z.object({ platform: platformSchema })
const bodySchema = z.object({ enabled: z.boolean() })

export function registerPlatformRoutes(
  app: FastifyInstance,
  orchestrator: Orchestrator,
  settings: SettingsStore,
): void {
  app.patch('/api/platforms/:platform', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = paramsSchema.safeParse(request.params)
    const body = bodySchema.safeParse(request.body)
    if (!params.success || !body.success) {
      reply.code(400)
      return { ok: false, error: '参数不正确' }
    }
    const status = orchestrator.setPlatform(params.data.platform, { enabled: body.data.enabled })
    settings.setEnabled(params.data.platform, body.data.enabled)
    orchestrator.refresh()
    return { ok: true, platform: status }
  })
}
