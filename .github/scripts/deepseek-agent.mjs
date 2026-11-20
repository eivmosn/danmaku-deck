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

/**
 * 给模型一点真实的仓库内容，否则它只能靠猜。
 * 控制在：README 4k、文件树 100 条、package.json 脚本/依赖名、评论里点名的文件各 8k。
 */
async function loadRepoContext() {
  const parts = []

  const readme = await ghApi(`/repos/${REPO}/readme`).catch(() => null)
  if (readme?.content) {
    const text = Buffer.from(readme.content, 'base64').toString('utf8').slice(0, 4000)
    parts.push(`### README
${text}`)
  }

  const tree = await ghApi(`/repos/${REPO}/git/trees/${repo.default_branch}`).catch(() => null)
  if (tree?.tree) {
    const lines = tree.tree
      .slice(0, 100)
      .map((item) => `${item.type === 'tree' ? '[目录]' : '[文件]'} ${item.path}`)
    parts.push(`### 顶层结构\n${lines.join('\n')}`)
  }

  const pkg = await ghApi(`/repos/${REPO}/contents/package.json`).catch(() => null)
  if (pkg?.content) {
    try {
      const parsed = JSON.parse(Buffer.from(pkg.content, 'base64').toString('utf8'))
      const scripts = Object.keys(parsed.scripts ?? {}).join(', ')
      const deps = Object.keys(parsed.dependencies ?? {}).join(', ')
      parts.push(`### package.json\nscripts: ${scripts}\n依赖: ${deps}`)
    } catch {
      // 解析不了就算了
    }
  }

  // 评论里点到的文件，把内容带上（最多 3 个）
  const mentioned = [...TRIGGER_TEXT.matchAll(/[\w./-]+\.(?:ts|tsx|js|mjs|json|md|yml|yaml)/g)]
    .map((match) => match[0].replace(/^\.\//, ''))
    .filter((path, index, list) => list.indexOf(path) === index)
    .slice(0, 3)

  // 顺带把同名测试文件也取上：改代码必须同时看到测试
  const wanted = []
  for (const path of mentioned) {
    wanted.push(path)
    if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      wanted.push(path.replace(/\.ts$/, '.test.ts'))
    }
  }

  for (const path of wanted.slice(0, 6)) {
    // 文件不多，顺序取足够；并发去拉会让后面的接口调用更难读懂
    // eslint-disable-next-line no-await-in-loop
    const file = await ghApi(`/repos/${REPO}/contents/${path}`).catch(() => null)
    if (!file?.content) continue
    // tar 目录会返回数组，没有 content 字段，上面已经过滤掉
    const text = Buffer.from(file.content, 'base64').toString('utf8').slice(0, 20_000)
    parts.push(`### 文件 ${path}\n\`\`\`\n${text}\n\`\`\``)
  }

  return parts.join('\n\n')
}

const repoContext = await loadRepoContext()

const history = comments
  .slice(-8)
  .map((item) => `${item.user.login}: ${(item.body ?? '').slice(0, 800)}`)
  .join('\n---\n')

const prompt = `你是这个仓库的维护助手，用中文回答。仓库：${REPO}（默认分支 ${repo.default_branch}）
当前是 ${issue.pull_request ? 'PR' : 'issue'} #${ISSUE_NUMBER}：${issue.title}

你可以看到的仓库内容（有据可依时才下结论，看不到就说看不到）：
${repoContext || '（没抓到任何文件）'}

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
      "patch": "git diff 格式的 unified diff（推荐）",
      "files": [ { "path": "相对路径", "content": "文件完整内容（仅当 patch 不适用时）" } ] }
  ]
}

硬性约束：
- 改代码优先用 patch（unified diff），它比整文件替换可靠：只写改动的片段，不要重写整个文件
- patch 必须是标准 git diff：以 diff --git a/... b/... 开头，含 ---/+++ 与 @@ 行号
- 用 files 模式时最多 ${MAX_FILES} 个、每个不超过 ${MAX_BYTES} 字节
- 路径一律不许以 ${BLOCKED_PREFIX} 开头
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

/**
 * 两种模式：
 *   patch → 在 workflow 的 checkout 里 git apply，再提交推送（改动小、可靠）
 *   files → 走 git tree API 整文件替换（改动大但模型要写出完整文件）
 */
async function createPullRequest(action) {
  const branch = (action.branch ?? `ai/issue-${ISSUE_NUMBER}`).replace(/[^\w./-]/g, '-')
  const title = action.title ?? `AI 修复 #${ISSUE_NUMBER}`
  const body = `${action.body ?? ''}\n\n---\nDeepSeek 助手根据 #${ISSUE_NUMBER} 生成，**未经验证，请审查后再合并**。`

  if (typeof action.patch === 'string' && action.patch.includes('@@')) {
    const { execSync } = await import('node:child_process')
    const { writeFileSync } = await import('node:fs')
    const path = `/tmp/ai-${ISSUE_NUMBER}.patch`
    writeFileSync(path, action.patch.endsWith('\n') ? action.patch : `${action.patch}\n`)

    execSync(`git checkout -B ${branch}`, { stdio: 'inherit' })
    execSync(`git apply --index --whitespace=nowarn ${path}`, { stdio: 'inherit' })
    execSync(
      'git -c user.name="deepseek-agent" -c user.email="actions@github.com" commit -m ' +
        JSON.stringify(`${title}\n\nDeepSeek 助手根据 #${ISSUE_NUMBER} 生成`),
      { stdio: 'inherit' },
    )
    execSync(`git push --force origin ${branch}`, { stdio: 'inherit' })

    const pr = await ghApi(`/repos/${REPO}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, head: branch, base: repo.default_branch, body }),
    })
    return pr.html_url
  }

  const files = (action.files ?? [])
    .filter((file) => typeof file?.path === 'string' && typeof file?.content === 'string')
    .filter((file) => !file.path.startsWith(BLOCKED_PREFIX))
    .filter((file) => Buffer.byteLength(file.content) <= MAX_BYTES)
    .slice(0, MAX_FILES)

  if (files.length === 0) return null

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
      message: `${title}\n\nDeepSeek 助手根据 #${ISSUE_NUMBER} 生成`,
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
    body: JSON.stringify({ title, head: branch, base: repo.default_branch, body }),
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
