/**
 * mihomo（Clash）控制接口。
 *
 * 端点来自现有桥里跑通的用法：
 *   GET  /proxies/<group>        → { now, all: string[] }
 *   PUT  /proxies/<group>        → 切节点，body { name }
 *   PUT  /configs?force=true     → 重载配置，body { path }
 */

export interface ProxyStatus {
  group: string
  node: string
  nodes: string[]
}

export interface MihomoOptions {
  baseUrl?: string
  /** 分组名，NAS 上用的是 AUTO */
  group?: string
  fetchImpl?: typeof fetch
}

interface ProxiesPayload {
  now?: string
  all?: string[]
  proxies?: Record<string, { now?: string; all?: string[] }>
}

export class MihomoClient {
  private readonly baseUrl: string
  private readonly group: string
  private readonly fetchImpl: typeof fetch

  constructor(options: MihomoOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:9090').replace(/\/$/, '')
    this.group = options.group ?? 'AUTO'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async status(): Promise<ProxyStatus> {
    const payload = (await this.get(`/proxies/${encodeURIComponent(this.group)}`)) as ProxiesPayload
    return {
      group: this.group,
      node: payload.now ?? '',
      nodes: payload.all ?? [],
    }
  }

  async selectNode(name: string): Promise<boolean> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/proxies/${encodeURIComponent(this.group)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      },
    )
    return response.ok
  }

  /** 让 mihomo 重新读取配置文件 */
  async reload(configPath: string): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/configs?force=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: configPath }),
    })
    return response.ok
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`)
    if (!response.ok) throw new Error(`mihomo 返回 ${response.status}`)
    return response.json()
  }
}
