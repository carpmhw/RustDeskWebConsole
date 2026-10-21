import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

// 用真resetStack及受控Docker替身驗三檔，不啟daemon、不承接操作者秘密。
for (const suite of [
  undefined,
  'playwright.reconnect-longrun.config.ts',
  'playwright.reconnect-ingress.config.ts',
])
  for (const override of [
    undefined,
    'frontend/e2e/docker/docker-compose.browser-login-test.yml',
    'frontend/e2e/docker/docker-compose.reconnect-test.yml',
    'unknown.yml',
  ]) {
    it(
      'reset uses exact compose whitelist: ' + String(override) + ' / ' + String(suite),
      async () => {
        const directory = mkdtempSync('/tmp/opencode/reconnect-reset-')
        const calls = join(directory, 'calls')
        const previous = process.env
        writeFileSync(calls, '')
        writeFileSync(
          join(directory, 'docker'),
          '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$PUBLIC_RESET_CALLS"\n',
          { mode: 0o700 },
        )
        process.env = {
          PATH: directory + ':' + previous.PATH,
          HOME: previous.HOME,
          RDWEB_E2E_USERNAME: 'public-fixture',
          RDWEB_E2E_PASSWORD: 'public-fixture-password',
          PUBLIC_RESET_CALLS: calls,
          ...(suite === undefined
            ? {}
            : {
                RDWEB_B3_SUITE_CONFIG: suite,
                RDWEB_B3_BASES: '/rdweb',
                RDWEB_B3_MODES: 'preserve',
                RDWEB_INPUT_PLATFORMS: 'linux',
                RDWEB_INPUT_CHANNELS: 'chromium',
              }),
          ...(override === undefined ? {} : { RDWEB_E2E_COMPOSE_OVERRIDE: override }),
        }
        vi.resetModules()
        try {
          const { resetStack } = await import('../management/helpers/fixtures')
          if (override === 'unknown.yml') {
            expect(() => resetStack()).toThrow('Isolated E2E stack did not become healthy')
            expect(readFileSync(calls, 'utf8')).toBe('')
          } else {
            resetStack()
            const call = readFileSync(calls, 'utf8')
            expect(call.includes('docker-compose.spikes.yml')).toBe(true)
            expect(call.includes('docker-compose.browser-login-test.yml')).toBe(
              override !== undefined,
            )
            expect(call.includes('docker-compose.reconnect-test.yml')).toBe(
              override === 'frontend/e2e/docker/docker-compose.reconnect-test.yml',
            )
            expect(call.includes('--force-recreate --wait')).toBe(true)
          }
        } finally {
          process.env = previous
          vi.resetModules()
          rmSync(directory, { recursive: true, force: true })
        }
      },
    )
  }
