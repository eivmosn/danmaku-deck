import { platformSchema } from '@ps5lb/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AccountsStore } from '@/accounts/store'

const paramsSchema = z.object({
  platform: platformSchema,
  id: z.string().min(1),
})

export function registerAccountRoutes(app: FastifyInstance, store: AccountsStore): void {
  app.get('/api/accounts', async () => {
    const activeIds = new Set([store.active('bilibili')?.id, store.active('xiaohongshu')?.id])
    const accounts = store.list().map((account) => ({
      id: account.id,
      platform: account.platform,
      displayName: account.displayName,
      externalId: account.externalId,
      createdAt: account.createdAt,
      lastUsedAt: account.lastUsedAt ?? null,
      active: activeIds.has(account.id),
    }))
    return { ok: true, accounts }
  })

  app.post(
    '/api/accounts/:platform/:id/activate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = paramsSchema.safeParse(request.params)
      if (!parsed.success) {
        reply.code(400)
        return { ok: false, error: '参数不正确' }
      }
      const account = store.activate(parsed.data.platform, parsed.data.id)
      if (!account) {
        reply.code(404)
        return { ok: false, error: '账号不存在' }
      }
      return { ok: true, account }
    },
  )

  app.delete('/api/accounts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id?: string }).id ?? ''
    if (!store.remove(id)) {
      reply.code(404)
      return { ok: false, error: '账号不存在' }
    }
    return { ok: true }
  })
}
