import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// 只將沒有協定、授權或 fixture 職責的使用文件列入快速路徑。
export function isDocumentationPath(path) {
  if (/[\r\n\0]/.test(path) || path.split('/').some((part) => ['.', '..'].includes(part)))
    return false
  return (
    ['README.md', 'AGENTS.md', 'frontend/e2e/README.md'].includes(path) ||
    /^docs\/.+\.md$/.test(path)
  )
}

// 空差異或未知來源採完整檢查；混入任一非白名單檔案也不可略過測試。
export function documentationOnly(paths) {
  return paths.length > 0 && paths.every(isDocumentationPath)
}

// 工具本身、共用協定 helper、部署及工具鏈變更都需重驗診斷工具。
export function affectsTestTools(path) {
  return (
    /^(?:tools\/|frontend\/e2e\/|frontend\/src\/rdweb\/|deploy\/|\.github\/)/.test(path) ||
    /^(?:global\.json|Directory\.Build\.props|\.editorconfig|eslint\.config\.mjs|\.prettierrc\.json|frontend\/(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|eslint\.config\.js|tsconfig\.json|\.prettierrc\.json|patches\/.*)|src\/[^/]+\/(?:packages\.lock\.json|[^/]+\.csproj))$/.test(
      path,
    )
  )
}

// main 的 PR 一律發布前驗證；一般文件快檢、dev 日常跑基本測試，未知來源不略過。
export function verificationScope(paths, eventName, baseRef) {
  const full =
    (eventName === 'pull_request' && baseRef === 'main') ||
    eventName === 'workflow_dispatch' ||
    !['pull_request', 'push', 'workflow_dispatch'].includes(eventName) ||
    (eventName === 'pull_request' && !baseRef) ||
    !paths?.length
  const mode = full ? 'full' : documentationOnly(paths) ? 'docs' : 'basic'
  return { mode, tools: mode === 'full' || (mode === 'basic' && paths.some(affectsTestTools)) }
}

// PR 比較完整分支差異，push 比較 before；來源不可用時安全退回完整 CI。
export function changedPaths(eventName, baseSha, cwd = process.cwd()) {
  if (!['pull_request', 'push'].includes(eventName) || !/^[a-f0-9]{40}$/.test(baseSha ?? ''))
    return null
  try {
    const base = execFileSync('git', ['rev-parse', '--verify', `${baseSha}^{commit}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    const range = eventName === 'pull_request' ? [`${base}...HEAD`] : [base, 'HEAD']
    return execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', ...range], {
      cwd,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
  } catch {
    return null
  }
}

// 檢查 Markdown 與 HTML 中的本機檔案引用，不下載外部網站或執行文件範例。
export function checkDocumentLinks(path, root = process.cwd()) {
  const content = readFileSync(resolve(root, path), 'utf8')
  const links = [
    ...Array.from(
      content.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))[^)]*\)/g),
      // Markdown 連結可用尖括號包住含空白的路徑。
      (match) => match[1] ?? match[2],
    ),
    ...Array.from(
      content.matchAll(/(?:src|href)="([^"]+)"/g),
      // README 的 HTML 導覽與圖片也需驗證相對引用。
      (match) => match[1],
    ),
  ]
  for (const link of links) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(link)) continue
    const target = decodeURIComponent(link.split(/[?#]/, 1)[0])
    if (!target) continue
    const absolute = resolve(root, dirname(path), target)
    const local = relative(root, absolute)
    if (isAbsolute(local) || local === '..' || local.startsWith('../') || !existsSync(absolute))
      throw new Error(`文件引用不存在或超出儲存庫：${path} → ${link}`)
  }
}

// 彙總檢查拒絕失敗、取消及非預期略過，沿用 build-test 的固定檢查名稱。
export function verificationPassed(needs, eventName, baseRef) {
  if (needs.changes?.result !== 'success' || needs.docs?.result !== 'success') return false
  const { mode, tools } = needs.changes.outputs ?? {}
  if (!['docs', 'basic', 'full'].includes(mode) || !['true', 'false'].includes(tools)) return false
  if (eventName === 'pull_request' && baseRef === 'main' && mode !== 'full') return false
  if ((mode === 'docs' && tools !== 'false') || (mode === 'full' && tools !== 'true')) return false
  const expected = {
    checks: mode === 'docs' ? 'skipped' : 'success',
    tools: tools === 'true' ? 'success' : 'skipped',
    runtime: mode === 'full' ? 'success' : 'skipped',
    browser: mode === 'full' ? 'success' : 'skipped',
    e2e: mode === 'full' ? 'success' : 'skipped',
    'rustdesk-desktop': mode === 'full' ? 'success' : 'skipped',
  }
  return Object.entries(expected).every(
    // matrix 的彙總結果也必須符合本次預期範圍。
    ([job, result]) => needs[job]?.result === result,
  )
}

// 各 job 共用相同差異來源，避免文件檢查與測試分流判定不一致。
function currentPaths() {
  return changedPaths(process.env.CI_EVENT_NAME, process.env.CI_BASE_SHA)
}

// CLI 只接受固定操作，不將 PR 檔名或事件內容插入 shell 指令。
function main(command) {
  if (command === 'detect') {
    const scope = verificationScope(
      currentPaths(),
      process.env.CI_EVENT_NAME,
      process.env.CI_BASE_REF,
    )
    appendFileSync(process.env.GITHUB_OUTPUT, `mode=${scope.mode}\ntools=${scope.tools}\n`)
    console.log(`驗證範圍：${scope.mode}；診斷工具：${scope.tools}。`)
  } else if (command === 'docs') {
    const paths = currentPaths()
    const files = (
      paths ?? execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    )
      .filter(isDocumentationPath)
      .filter(existsSync)
    if (files.length > 0) {
      execFileSync('frontend/node_modules/.bin/prettier', ['--check', ...files], {
        stdio: 'inherit',
      })
      for (const path of files) checkDocumentLinks(path)
    }
    console.log(`文件格式與相對檔案引用檢查完成：${files.length} 份。`)
  } else if (command === 'gate') {
    if (
      !verificationPassed(
        JSON.parse(process.env.CI_NEEDS),
        process.env.CI_EVENT_NAME,
        process.env.CI_BASE_REF,
      )
    )
      throw new Error('必要的 CI 工作未全部通過。')
    console.log('本次範圍的必要檢查全部通過。')
  } else {
    throw new Error('未知的 CI 操作。')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv[2])
