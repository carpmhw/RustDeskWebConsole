import { expect, it } from 'vitest'
import { inputPlatforms, readWindowsRuntime } from '../../e2e-real/windows-runtime'

// 全部資料皆為公開虛構fixture，不讀取操作者真正的runtime憑證。
function fixture(): Record<string, string> {
  return {
    RDWEB_WINDOWS_ID_TCP: 'fixture.example:21116',
    RDWEB_WINDOWS_RELAY_TCP: 'fixture.example:21117',
    RDWEB_WINDOWS_ID_WS: 'fixture.example:21118',
    RDWEB_WINDOWS_RELAY_WS: 'fixture.example:21119',
    RDWEB_WINDOWS_PUBLIC_KEY: 'public-fixture-key',
    RDWEB_WINDOWS_TARGET_ID: '123456789',
    RDWEB_WINDOWS_PASSWORD: 'public-fixture-password',
    RDWEB_WINDOWS_EDITOR_X: '0',
    RDWEB_WINDOWS_EDITOR_Y: '61',
    RDWEB_WINDOWS_EDITOR_WIDTH: '1398',
    RDWEB_WINDOWS_EDITOR_HEIGHT: '894',
  }
}

// 遺漏任何必要欄位都須在formal API或Docker動作之前fail closed。
it.each(Object.keys(fixture()))('rejects a missing Windows runtime field %s', (field) => {
  const env = fixture()
  delete env[field]
  expect(() => readWindowsRuntime(env)).toThrow('Windows runtime fixture unavailable')
})

// literal矩形由使用者公開角點獨立計算，不由被測函數產生expected。
it('parses the declared public rectangle without expanding it to the display', () => {
  const runtime = readWindowsRuntime(fixture())
  expect(runtime.editor).toEqual({ x: 0, y: 61, width: 1398, height: 894 })
  expect(runtime.endpoints.tcp).toEqual({
    id: 'fixture.example:21116',
    relay: 'fixture.example:21117',
  })
  expect(runtime.endpoints.ws).toEqual({
    id: 'fixture.example:21118',
    relay: 'fixture.example:21119',
  })
})

// 幾何不接受隱含空白／小數／溢位，也不得讓固定測試點落出操作者公開區。
it.each([
  ['EDITOR_X', '-1'],
  ['EDITOR_Y', '4097'],
  ['EDITOR_WIDTH', '0'],
  ['EDITOR_WIDTH', '20'],
  ['EDITOR_HEIGHT', '30'],
  ['EDITOR_X', '1.5'],
  ['EDITOR_Y', ' '],
  ['EDITOR_WIDTH', 'NaN'],
  ['EDITOR_HEIGHT', 'Infinity'],
  ['EDITOR_X', '1e2'],
])('rejects unsafe public geometry %s', (field, value) => {
  const env = fixture()
  env['RDWEB_WINDOWS_' + field] = value
  expect(() => readWindowsRuntime(env)).toThrow('Public Windows editor geometry invalid')
})

// 請求Windows不能悄悄改跑Linux；空值、重複或未知平台都必須失敗。
it.each(['', 'macos', 'linux,', 'linux,linux', 'windows,linux,windows', 'linux, windows'])(
  'rejects an ambiguous input platform selection %s',
  (value) => {
    expect(() => inputPlatforms({ RDWEB_INPUT_PLATFORMS: value })).toThrow('Invalid input platform')
  },
)

// 未指定才預設Linux；合法雙平台保留要求順序，不新增平台或重複案例。
it('defaults to Linux only when unset and preserves explicit platform requests', () => {
  expect(inputPlatforms({})).toEqual(['linux'])
  expect(inputPlatforms({ RDWEB_INPUT_PLATFORMS: 'windows' })).toEqual(['windows'])
  expect(inputPlatforms({ RDWEB_INPUT_PLATFORMS: 'linux,windows' })).toEqual(['linux', 'windows'])
  expect(inputPlatforms({ RDWEB_INPUT_PLATFORMS: 'windows,linux' })).toEqual(['windows', 'linux'])
})
