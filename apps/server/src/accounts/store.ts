import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Platform } from '@ps5lb/shared'
import { z } from 'zod'

/** 账号凭证：不同平台字段不同，统一用键值对存 */
const credentialSchema = z.record(z.string(), z.string())

export const accountSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['bilibili', 'xiaohongshu']),
  displayName: z.string(),
  externalId: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
})

export type Account = z.infer<typeof accountSchema>
export type Credential = z.infer<typeof credentialSchema>

const fileSchema = z.object({
  version: z.literal(1),
  accounts: z.array(accountSchema),
  /** accountId → 加密后的凭证（base64） */
  secrets: z.record(z.string(), z.string()),
})

interface AccountFile {
  version: 1
  accounts: Account[]
  secrets: Record<string, string>
}

const ALGORITHM = 'aes-256-gcm'

/**
 * 多账号存储：元信息明文，凭证 AES-256-GCM 加密。
 * 密钥文件与数据文件都放 0600，默认在 ~/.ps5lb 下。
 */
export class AccountsStore {
  private readonly dataPath: string
  private readonly keyPath: string
  private cache: AccountFile | null = null

  constructor(options: { dir?: string } = {}) {
    const dir = options.dir ?? join(process.cwd(), '.ps5lb')
    this.dataPath = join(dir, 'accounts.json')
    this.keyPath = join(dir, 'accounts.key')
  }

  list(): Account[] {
    return this.read().accounts
  }

  /** 当前激活的账号：每个平台最多一个 */
  active(platform: Platform): Account | null {
    const accounts = this.list().filter((item) => item.platform === platform)
    if (accounts.length === 0) return null
    return accounts.reduce((latest, item) =>
      (item.lastUsedAt ?? '') > (latest.lastUsedAt ?? '') ? item : latest,
    )
  }

  add(input: {
    platform: Platform
    displayName: string
    externalId: string
    secret: Credential
  }): Account {
    const data = this.read()
    const now = new Date().toISOString()
    const account: Account = {
      id: randomBytes(8).toString('hex'),
      platform: input.platform,
      displayName: input.displayName,
      externalId: input.externalId,
      createdAt: now,
      lastUsedAt: now,
    }
    data.accounts.push(account)
    data.secrets[account.id] = this.encrypt(JSON.stringify(input.secret))
    this.write(data)
    return account
  }

  /** 切换激活账号：写 lastUsedAt，返回账号 */
  activate(platform: Platform, id: string): Account | null {
    const data = this.read()
    const account = data.accounts.find((item) => item.id === id && item.platform === platform)
    if (!account) return null
    account.lastUsedAt = new Date().toISOString()
    this.write(data)
    return account
  }

  secret(id: string): Credential | null {
    const raw = this.read().secrets[id]
    if (!raw) return null
    try {
      return credentialSchema.parse(JSON.parse(this.decrypt(raw)))
    } catch {
      return null
    }
  }

  remove(id: string): boolean {
    const data = this.read()
    const before = data.accounts.length
    data.accounts = data.accounts.filter((item) => item.id !== id)
    delete data.secrets[id]
    if (data.accounts.length === before) return false
    this.write(data)
    return true
  }

  private read(): AccountFile {
    if (this.cache) return this.cache
    if (!existsSync(this.dataPath)) {
      this.cache = { version: 1, accounts: [], secrets: {} }
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
    const raw = readFileSync(this.keyPath, 'utf8').trim()
    return scryptSync(raw, 'ps5lb-accounts', 32)
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
