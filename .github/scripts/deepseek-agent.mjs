/**
 * DeepSeek 仓库助手：在 issue / PR 评论里 @deepseek 就干活。
 *
 * 用 Actions 自带的 GITHUB_TOKEN 发评论，所以显示成 github-actions[bot]。
 *
 * 能做的：回复分析、开 issue、开 PR（模型给出完整文件内容，走 git tree API 一次提交）。
 * 不做的：合并、关闭、改 .github/workflows（防止它自己改自己的 CI）。
 */

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const REPO = process.env.GITHUB_REPOSITORY ?? ''
const ISSUE_NUMBER = Number(process.env.ISSUE_NUMBER)
const TRIGGER_TEXT = process.env.TRIGGER_TEXT ?? ''
const MENTION = process.env.AGENT_MENTION ?? '@deepseek'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
const BASE = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'

const BLOCKED_PREFIX = '.github/workflows'
const MAX_FILES = 8
const MAX_BYTES = 200_000

if (!REPO || !Number.isInteger(ISSUE_NUMBER) || !DEEPSEEK_KEY) {
  console.error('缺少 GITHUB_REPOSITORY / ISSUE_NUMBER / DEEPSEEK_API_KEY，跳过')
  process.exit(0)
}

// 只有被明确 @ 到才干活，避免每条评论都触发
if (!TRIGGER_TEXT.toLowerCase().includes(MENTION.toLowerCase())) {
  console.log(`评论里没有 ${MENTION}，跳过`)
  process.exit(0)
}

const token = process.env.GITHUB_TOKEN
const identity = 'github-actions[bot]'
console.log(`使用身份：${identity}`)

async function ghApi(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

const [issue, comments, repo] = await Promise.all([
  ghApi(`/repos/${REPO}/issues/${ISSUE_NUMBER}`),
  ghApi(`/repos/${REPO}/issues/${ISSUE_NUMBER}/comments?per_page=30`),
  ghApi(`/repos/${REPO}`),
])

const history = comments
  .slice(-8)
  .map((item) => `${item.user.login}: ${(item.body ?? '').slice(0, 800)}`)
  .join('\n---\n')

const prompt = `你是这个仓库的维护助手，用中文回答。仓库：${REPO}（默认分支 ${repo.default_branch}）
当前是 ${issue.pull_request ? 'PR' : 'issue'} #${ISSUE_NUMBER}：${issue.title}

正文：
${(issue.body ?? '（空）').slice(0, 3000)}

最近评论：
${history.slice(0, 4000)}

用户刚说：
${TRIGGER_TEXT.slice(0, 2000)}

可选动作（按需，不要硬凑）：
- 回复：说明判断、需要用户补充什么
- 开 issue：确认是新 bug 且值得单独跟踪时
- 开 PR：只有在你能给出完整可替换的文件内容、且改动小且明确时才做

严格只输出一个 JSON 对象，不要代码围栏：
{
  "reply": "给用户看的回复（Markdown）",
  "actions": [
    { "type": "create_issue", "title": "...", "body": "..." },
    { "type": "create_pr", "title": "...", "branch": "ai/xxx", "body": "...",
      "files": [ { "path": "相对路径", "content": "文件完整内容" } ] }
  ]
}

硬性约束：
- files 最多 ${MAX_FILES} 个，每个不超过 ${MAX_BYTES} 字节，路径不许以 ${BLOCKED_PREFIX} 开头
- 不许输出删除文件、合并、关闭这类动作
- 信息不足时 actions 留空数组，只在 reply 里说明缺什么`

const aiResponse = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '你是严谨的仓库维护助手。只输出 JSON，不输出解释性文字。' },
      { role: 'user', content: prompt },
    ],
  }),
})

if (!aiResponse.ok) {
  console.error(`DeepSeek 请求失败：${aiResponse.status} ${await aiResponse.text()}`)
  process.exit(0)
}

const raw = (await aiResponse.json()).choices?.[0]?.message?.content ?? ''
let plan = { reply: '（模型没有返回有效内容）', actions: [] }
try {
  plan = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
} catch {
  plan = { reply: '（模型返回的 JSON 解析失败）', actions: [] }
}

async function comment(body) {
  await ghApi(`/repos/${REPO}/issues/${ISSUE_NUMBER}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}

async function createIssue(action) {
  const created = await ghApi(`/repos/${REPO}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: action.title, body: action.body ?? '' }),
  })
  return created.html_url
}

async function createPullRequest(action) {
  const files = (action.files ?? [])
    .filter((file) => typeof file?.path === 'string' && typeof file?.content === 'string')
    .filter((file) => !file.path.startsWith(BLOCKED_PREFIX))
    .filter((file) => Buffer.byteLength(file.content) <= MAX_BYTES)
    .slice(0, MAX_FILES)

  if (files.length === 0) return null

  const branch = (action.branch ?? `ai/issue-${ISSUE_NUMBER}`).replace(/[^\w./-]/g, '-')
  const baseSha = (await ghApi(`/repos/${REPO}/git/ref/heads/${repo.default_branch}`)).object.sha
  const baseCommit = await ghApi(`/repos/${REPO}/git/commits/${baseSha}`)

  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await ghApi(`/repos/${REPO}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
      })
      return { path: file.path, sha: blob.sha }
    }),
  )

  const tree = await ghApi(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: blobs.map((blob) => ({ path: blob.path, mode: '100644', type: 'blob', sha: blob.sha })),
    }),
  })

  const commit = await ghApi(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${action.title ?? `AI 修复 #${ISSUE_NUMBER}`}\n\nDeepSeek 助手根据 #${ISSUE_NUMBER} 生成`,
      tree: tree.sha,
      parents: [baseSha],
    }),
  })

  await ghApi(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  })

  const pr = await ghApi(`/repos/${REPO}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: action.title ?? `AI 修复 #${ISSUE_NUMBER}`,
      head: branch,
      base: repo.default_branch,
      body: `${action.body ?? ''}\n\n---\nDeepSeek 助手根据 #${ISSUE_NUMBER} 生成，**未经验证，请审查后再合并**。`,
    }),
  })
  return pr.html_url
}

const notes = []
// 动作必须按顺序做（开 issue 再开 PR 更容易读懂），这里不能用 Promise.all
for (const action of plan.actions ?? []) {
  try {
    if (action.type === 'create_issue') {
      // eslint-disable-next-line no-await-in-loop
      notes.push(`已开 issue：${await createIssue(action)}`)
    } else if (action.type === 'create_pr') {
      // eslint-disable-next-line no-await-in-loop
      const url = await createPullRequest(action)
      notes.push(url ? `已开 PR：${url}` : '想开 PR，但文件不符合约束（路径/数量/大小），已跳过')
    }
  } catch (error) {
    notes.push(`动作 ${action.type} 失败：${error.message}`)
    console.error(error)
  }
}

const footer = notes.length > 0 ? `\n\n---\n${notes.map((line) => `- ${line}`).join('\n')}` : ''
await comment(
  `${plan.reply ?? '（无内容）'}${footer}\n\n<sub>DeepSeek (${MODEL}) · ${identity}</sub>`,
)
console.log('已回复')
