import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Platform } from '@ps5lb/shared'
import { z } from 'zod'

const credentialSchema = z.record(z.string(), z.string())

export const accountSchema = z.object({
  platform: z.enum(['bilibili', 'xiaohongshu']),
  displayName: z.string(),
  externalId: z.string(),
  loggedInAt: z.string(),
})

export type Account = z.infer<typeof accountSchema>
export type Credential = z.infer<typeof credentialSchema>

/**
 * 每个平台只保留一个登录态。
 * 换号 = 先退出再登录，不维护账号列表。
 */
const fileSchema = z.object({
  version: z.literal(2),
  accounts: z.record(z.string(), accountSchema).default({}),
  /** platform → 加密后的凭证（base64） */
  secrets: z.record(z.string(), z.string()).default({}),
})

interface AccountFile {
  version: 2
  accounts: Record<string, Account>
  secrets: Record<string, string>
}

const ALGORITHM = 'aes-256-gcm'
const PLATFORMS: Platform[] = ['bilibili', 'xiaohongshu']

export class AccountsStore {
  private readonly dataPath: string
  private readonly keyPath: string
  private cache: AccountFile | null = null

  constructor(options: { dir?: string } = {}) {
    const dir = options.dir ?? join(process.cwd(), '.ps5lb')
    this.dataPath = join(dir, 'accounts.json')
    this.keyPath = join(dir, 'accounts.key')
  }

  /** 当前登录的账号（没有则 null） */
  get(platform: Platform): Account | null {
    return this.read().accounts[platform] ?? null
  }

  /** 登录或更换账号：直接覆盖该平台的登录态 */
  signIn(input: {
    platform: Platform
    displayName: string
    externalId: string
    secret: Credential
  }): Account {
    const data = this.read()
    const account: Account = {
      platform: input.platform,
      displayName: input.displayName,
      externalId: input.externalId,
      loggedInAt: new Date().toISOString(),
    }
    data.accounts[input.platform] = account
    data.secrets[input.platform] = this.encrypt(JSON.stringify(input.secret))
    this.write(data)
    return account
  }

  /** 退出登录：清掉账号与凭证 */
  signOut(platform: Platform): boolean {
    const data = this.read()
    if (!data.accounts[platform]) return false
    delete data.accounts[platform]
    delete data.secrets[platform]
    this.write(data)
    return true
  }

  secret(platform: Platform): Credential | null {
    const raw = this.read().secrets[platform]
    if (!raw) return null
    try {
      return credentialSchema.parse(JSON.parse(this.decrypt(raw)))
    } catch {
      return null
    }
  }

  /** 一次性拿到所有平台的登录态，接口用 */
  snapshot(): Array<Account | null> {
    return PLATFORMS.map((platform) => this.get(platform))
  }

  private read(): AccountFile {
    if (this.cache) return this.cache
    if (!existsSync(this.dataPath)) {
      this.cache = { version: 2, accounts: {}, secrets: {} }
      return this.cache
    }
    const parsed = fileSchema.parse(JSON.parse(readFileSync(this.dataPath, 'utf8')))
    this.cache = parsed
    return parsed
  }

  private write(data: AccountFile): void {
    this.cache = data
    mkdirSync(dirname(this.dataPath), { recursive: true, mode: 0o700 })
    writeFileSync(this.dataPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  }

  private key(): Buffer {
    if (!existsSync(this.keyPath)) {
      mkdirSync(dirname(this.keyPath), { recursive: true, mode: 0o700 })
      writeFileSync(this.keyPath, randomBytes(32).toString('hex'), { mode: 0o600 })
    }
    return scryptSync(readFileSync(this.keyPath, 'utf8').trim(), 'ps5lb-accounts', 32)
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, this.key(), iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.')
  }

  private decrypt(payload: string): string {
    const [ivPart, tagPart, dataPart] = payload.split('.')
    if (!ivPart || !tagPart || !dataPart) throw new Error('凭证格式不正确')
    const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(ivPart, 'base64'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }
}
