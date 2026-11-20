import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 用 catbus 拿小红书昵称。
 *
 * 小红书自己的 web API 需要 x-s 签名，自己算不划算；catbus 已经处理了签名，
 * 所以这里借它的 cookie 登录能力：写入临时文件 → auth login → auth status。
 */
export interface XhsProfile {
  name: string
  id: string
}

export type CatbusRunner = (args: string[]) => Promise<string>

const defaultRunner: CatbusRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('catbus', args, { timeout: 20_000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })

export async function fetchXhsProfile(
  cookie: string,
  runner: CatbusRunner = defaultRunner,
): Promise<XhsProfile | null> {
  const file = join(tmpdir(), `xhs-cookie-${Date.now()}.txt`)
  try {
    writeFileSync(file, cookie, { mode: 0o600 })
    await runner(['xhs', 'auth', 'login', '--method', 'cookie', '--cookie', `@${file}`])
    const output = await runner(['xhs', 'auth', 'status'])
    return parseStatus(output)
  } catch {
    return null
  }
}

/** 从 catbus 的 JSON 输出里取昵称与 id */
export function parseStatus(output: string): XhsProfile | null {
  const line = output.split('\n').find((item) => item.trim().startsWith('{'))
  if (!line) return null
  try {
    const payload = JSON.parse(line) as {
      data?: { user?: { name?: string; id?: string }; logged_in?: boolean }
    }
    const user = payload.data?.user
    if (!user?.name) return null
    return { name: user.name, id: user.id ?? '' }
  } catch {
    return null
  }
}
