import { platformSchema } from '@ps5lb/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AccountsStore } from '@/accounts/store'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'

const PLATFORM_LABEL = { bilibili: 'B站', xiaohongshu: '小红书' } as const

export function registerAccountRoutes(
  app: FastifyInstance,
  store: AccountsStore,
  orchestrator: Orchestrator,
  logs: LogService,
): void {
  app.get('/api/accounts', async () => {
    const accounts = store.snapshot()
    return {
      ok: true,
      accounts: accounts.filter((account) => account !== null),
    }
  })

  // 退出登录：清掉该平台登录态，同时把界面上的昵称清空
  app.post(
    '/api/accounts/:platform/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = platformSchema.safeParse((request.params as { platform?: string }).platform)
      if (!parsed.success) {
        reply.code(400)
        return { ok: false, error: '平台不正确' }
      }
      if (!store.signOut(parsed.data)) {
        reply.code(404)
        return { ok: false, error: '当前没有登录' }
      }
      orchestrator.setPlatform(parsed.data, { accountName: null })
      logs.write('info', PLATFORM_LABEL[parsed.data], '已退出登录')
      return { ok: true }
    },
  )
}
