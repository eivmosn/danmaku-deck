import ansis from 'ansis'
import figlet from 'figlet'

const FIGLET_FONT = 'ANSI Shadow'

export interface BannerInfo {
  version: string
  host: string
  port: number
  mode: string
}

/** figlet 的 text 是回调式 API，包一层 Promise */
function renderTitle(text: string): Promise<string> {
  return new Promise((resolve) => {
    figlet.text(text, { font: FIGLET_FONT }, (error, output) => {
      resolve(error ? text : (output ?? text))
    })
  })
}

/** 启动横幅：只在终端里打印，管道/日志重定向时自动跳过 */
export async function printBanner(info: BannerInfo): Promise<void> {
  if (process.env.PS5LB_NO_BANNER === '1' || !process.stdout.isTTY) return

  const title = await renderTitle('PS5')
  const lines = [
    ansis.cyan(title.replace(/\s+$/, '')),
    `  ${ansis.bold('LIVE BRIDGE')} ${ansis.dim(`v${info.version}`)}`,
    '',
    `  ${ansis.dim('监听')}   ${ansis.green(`http://${info.host}:${info.port}`)}`,
    `  ${ansis.dim('模式')}   ${info.mode}`,
    `  ${ansis.dim('状态')}   ${ansis.yellow('idle')} ${ansis.dim('（等 PS5 推流）')}`,
    '',
  ]

  process.stdout.write(`${lines.join('\n')}\n`)
}
