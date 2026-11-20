import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AccountsStore } from '@/accounts/store'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'
import { fetchXhsProfile } from '@/platforms/xiaohongshu/account'
import type { XiaohongshuApi } from '@/platforms/xiaohongshu/api'
import type { PushTargetsStore } from '@/push/targets-store'

const loginSchema = z.object({ cookie: z.string().min(10) })
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export interface XiaohongshuDeps {
  api: XiaohongshuApi
  accounts: AccountsStore
  pushTargets: PushTargetsStore
  orchestrator: Orchestrator
  logs: LogService
}

export function registerXiaohongshuRoutes(app: FastifyInstance, deps: XiaohongshuDeps): void {
  // 用网页 cookie 登录；顺便确认有没有 OBS 权限
  app.post(
    '/api/platforms/xiaohongshu/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = loginSchema.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { ok: false, error: '请提供完整的小红书 cookie' }
      }
      const auth = await deps.api.hostAuth(parsed.data.cookie)
      if (!auth.ok) {
        deps.logs.write('error', '小红书', `登录失败：${auth.detail ?? '未知原因'}`)
        reply.code(400)
        return { ok: false, error: auth.detail ?? '登录失败' }
      }

      // 用 catbus 取昵称，取不到就用占位名（不影响登录）
      const profile = await fetchXhsProfile(parsed.data.cookie)
      const account = deps.accounts.signIn({
        platform: 'xiaohongshu',
        displayName: profile?.name ?? '小红书账号',
        externalId: profile?.id ?? '',
        secret: { cookie: parsed.data.cookie },
      })
      deps.pushTargets.clear('xiaohongshu')
      deps.orchestrator.setPlatform('xiaohongshu', { accountName: account.displayName })
      deps.orchestrator.refresh()
      deps.logs.write(
        'info',
        '小红书',
        auth.data?.allowObs ? '已登录，OBS 权限正常' : '已登录，但还没有开通过电脑直播',
      )
      return { ok: true, account, allowObs: auth.data?.allowObs ?? false }
    },
  )

  // 每场开播都要输入 6 位开播码换推流地址
  app.post(
    '/api/platforms/xiaohongshu/code',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = codeSchema.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { ok: false, error: '开播码是 6 位数字' }
      }
      const secret = deps.accounts.secret('xiaohongshu')
      if (!secret?.cookie) {
        reply.code(409)
        return { ok: false, error: '还没有登录小红书' }
      }

      const result = await deps.api.pushUrlByCode(secret.cookie, parsed.data.code)
      if (!result.ok || !result.data) {
        deps.logs.write('error', '小红书', `开播码兑换失败：${result.detail ?? '未知原因'}`)
        reply.code(400)
        return { ok: false, error: result.detail ?? '兑换失败' }
      }

      deps.pushTargets.set('xiaohongshu', result.data)
      deps.orchestrator.refresh()
      deps.logs.write('info', '小红书', '开播码兑换成功，推流地址已保存')
      return { ok: true, server: result.data.server }
    },
  )
}
