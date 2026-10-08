import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const location = execFileSync('dotnet', ['nuget', 'locals', 'global-packages', '--list'], {
  encoding: 'utf8',
}).trim()
const cache = location.slice(location.indexOf(':') + 1).trim()
const packages = new Map()

// 從已鎖定及還原的 NuGet 套件取得原始授權宣告，不新增授權掃描相依。
for (const project of ['RdWeb.Api', 'RdWeb.Tests']) {
  const lock = JSON.parse(readFileSync(`src/${project}/packages.lock.json`, 'utf8'))
  for (const dependencies of Object.values(lock.dependencies)) {
    for (const [name, metadata] of Object.entries(dependencies)) {
      if (!metadata.resolved) continue
      const nuspec = readFileSync(
        join(cache, name.toLowerCase(), metadata.resolved, `${name.toLowerCase()}.nuspec`),
        'utf8',
      )
      const license =
        nuspec.match(/<license(?:\s[^>]*)?>([^<]+)<\/license>/)?.[1] ??
        nuspec.match(/<licenseUrl>([^<]+)<\/licenseUrl>/)?.[1]
      if (!license) throw new Error(`缺少授權宣告：${name}`)
      packages.set(`${name}@${metadata.resolved}`, { name, version: metadata.resolved, license })
    }
  }
}
mkdirSync('artifacts', { recursive: true })
writeFileSync(
  'artifacts/nuget-licenses.json',
  JSON.stringify([...packages.values()], null, 2) + '\n',
)
const frontend = execFileSync(
  'corepack',
  ['pnpm', '--dir', 'frontend', 'licenses', 'list', '--json'],
  { encoding: 'utf8', maxBuffer: 4000000 },
)
JSON.parse(frontend)
writeFileSync('artifacts/frontend-licenses.json', frontend)
console.log(`已產出 ${packages.size} 個 NuGet 套件與前端套件授權清單。`)
