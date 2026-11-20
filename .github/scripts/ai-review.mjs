/**
 * DeepSeek 自动代码审查。
 *
 * 在 GitHub Actions 里跑：读 PR 的 diff，交给 DeepSeek 审，把结论作为 PR 评论发回去。
 * 需要仓库 secret：DEEPSEEK_API_KEY（必填）
 * 可选：DEEPSEEK_MODEL（默认 deepseek-chat）、DEEPSEEK_BASE_URL（默认官方地址）
 *
 * 用 GITHUB_TOKEN + GitHub REST，不引任何依赖（Node 22 自带 fetch）。
 */

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const TOKEN = process.env.GITHUB_TOKEN
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
const BASE = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const MARKER = '<!-- deepseek-auto-review -->'
const MAX_DIFF = 60_000

const repo = process.env.GITHUB_REPOSITORY
const prNumber = Number(process.env.PR_NUMBER)

if (!repo || !Number.isInteger(prNumber) || !TOKEN) {
  console.error('缺少 GITHUB_REPOSITORY / PR_NUMBER / GITHUB_TOKEN')
  process.exit(1)
}

async function gh(path, init = {}) {
  const response = await fetch(`${API}/repos/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} 失败：${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

/** 没有 key 时给出可操作的提示，而不是静默失败 */
async function comment(body) {
  await gh(`/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}

if (!DEEPSEEK_KEY) {
  await comment(
    `${MARKER}\n### 🤖 DeepSeek 审查未运行\n\n缺少仓库 secret \`DEEPSEEK_API_KEY\`：\n\n` +
      '`Settings → Secrets and variables → Actions → New repository secret`，名字填 `DEEPSEEK_API_KEY`。',
  )
  process.exit(0)
}

const [pr, files] = await Promise.all([
  gh(`/pulls/${prNumber}`),
  gh(`/pulls/${prNumber}/files?per_page=100`),
])

let diff = files
  .map((file) => {
    const head = `--- ${file.filename} (+${file.additions}/-${file.deletions})`
    return file.patch ? `${head}\n${file.patch}` : `${head}\n（二进制或过大，无 patch）`
  })
  .join('\n\n')

let truncated = false
if (diff.length > MAX_DIFF) {
  diff = `${diff.slice(0, MAX_DIFF)}\n\n…（diff 过长已截断，仅审以上部分）`
  truncated = true
}

const prompt = `你是一名严格的资深工程师，正在审查一个 PR。请用中文输出。

仓库：${repo}
PR #${prNumber}：${pr.title}
作者说明：
${pr.body?.slice(0, 2000) || '（无）'}

改动文件：
${files.map((file) => `- ${file.filename} (+${file.additions}/-${file.deletions})`).join('\n')}

diff：
\`\`\`diff
${diff}
\`\`\`

要求：
1. 只指出**确实存在的问题**，不要为了凑数而评论风格偏好。
2. 每条问题给出：文件与大致位置、问题、为什么是问题、建议怎么改。
3. 重点看：逻辑错误、边界条件、并发/资源泄漏、错误处理、与真实协议或外部接口是否一致、测试是否真的覆盖了断言的东西。
4. 如果某处是根据推断而非证据写的（比如猜外部接口的字段），明确指出并要求给出依据。
5. 最后给一个结论：`通过` / `需要修改`，并说明理由。
6. 输出用 Markdown，控制在 800 字以内，不要复述 diff。`

const response = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${DEEPSEEK_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是严谨的代码审查员，只输出有问题的地方和建议，不讲客套话。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  }),
})

if (!response.ok) {
  await comment(`${MARKER}\n### 🤖 DeepSeek 审查失败\n\n\`\`\`\n${response.status} ${await response.text()}\n\`\`\``)
  process.exit(0)
}

const data = await response.json()
const review = data.choices?.[0]?.message?.content?.trim() || '（模型没有返回内容）'
const note = truncated ? '\n\n> 注：diff 过长，只审了前面一部分。' : ''

await comment(`${MARKER}\n### 🤖 DeepSeek 审查\n\n${review}${note}\n\n<sub>由 DeepSeek (${MODEL}) 自动生成</sub>`)
console.log('审查已发布')
