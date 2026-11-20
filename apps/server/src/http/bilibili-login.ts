import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AccountsStore } from '@/accounts/store'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'
import type { QRResult, QRStart, BilibiliProfile } from '@/platforms/bilibili/auth'

/** 只依赖这几个方法，便于测试替换 */
export interface BilibiliAuthPort {
  startQR: () => Promise<QRStart>
  pollQR: (key: string) => Promise<QRResult>
  profile: (credentials: Record<string, string>) => Promise<BilibiliProfile>
}

export interface BilibiliLoginDeps {
  auth: BilibiliAuthPort
  accounts: AccountsStore
  orchestrator: Orchestrator
  logs: LogService
  /** 二维码有效期，默认 3 分钟 */
  ttlMs?: number
}

export function registerBilibiliLoginRoutes(app: FastifyInstance, deps: BilibiliLoginDeps): void {
  const ttl = deps.ttlMs ?? 3 * 60 * 1000
  const pending = new Map<string, number>()

  app.post(
    '/api/platforms/bilibili/login/qr',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const start = await deps.auth.startQR()
        pending.set(start.key, Date.now() + ttl)
        deps.logs.write('info', 'B站', '已生成登录二维码')
        return { ok: true, key: start.key, url: start.url }
      } catch (error) {
        reply.code(502)
        const message = error instanceof Error ? error.message : '取二维码失败'
        deps.logs.write('error', 'B站', `生成二维码失败：${message}`)
        return { ok: false, error: message }
      }
    },
  )

  app.get(
    '/api/platforms/bilibili/login/qr/:key',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const key = (request.params as { key?: string }).key ?? ''
      const expiresAt = pending.get(key)
      if (!expiresAt) {
        reply.code(404)
        return { ok: false, error: '二维码不存在，请重新生成' }
      }

      const result = await deps.auth.pollQR(key)
      if (result.state === 'expired' || Date.now() > expiresAt) {
        pending.delete(key)
        return { ok: true, state: 'expired', message: '二维码已过期' }
      }
      if (result.state !== 'success') {
        return { ok: true, state: result.state, message: result.message }
      }

      pending.delete(key)
      if (!result.credentials) {
        reply.code(502)
        return { ok: false, error: '登录成功但没拿到凭证' }
      }

      try {
        const profile = await deps.auth.profile(result.credentials)
        const account = deps.accounts.add({
          platform: 'bilibili',
          displayName: profile.name,
          externalId: profile.uid,
          secret: result.credentials,
        })
        deps.orchestrator.setPlatform('bilibili', { accountName: profile.name })
        deps.logs.write('info', 'B站', `登录成功：${profile.name}`, { uid: profile.uid })
        return { ok: true, state: 'success', account }
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存账号失败'
        deps.logs.write('error', 'B站', `登录失败：${message}`)
        reply.code(502)
        return { ok: false, error: message }
      }
    },
  )
}
