import { expect, it } from 'vitest'
import { routeDecision, safeNext } from './policy'
// Viewer硬上限同樣適用console direct route，而非僅隱藏連線link。
it('does not let a viewer open console routes', () => {
  expect(
    routeDecision(
      {
        phase: 'authenticated',
        user: {
          id: 'id',
          username: 'reader',
          role: 'viewer',
          totp_enabled: false,
          mfa_enrollment_required: false,
        },
      },
      'console',
      true,
    ),
  ).toBe('targets')
})

// Restricted session不能透過網址或導覽繞過必要綁定。
it('guards anonymous and MFA-restricted navigation', () => {
  expect(routeDecision({ phase: 'anonymous', user: null }, 'security', true)).toBe('login')
  expect(routeDecision({ phase: 'unknown', user: null }, 'security', true)).toBeNull()
  const user = {
    id: 'fixture',
    username: 'fixture',
    role: 'admin' as const,
    totp_enabled: false,
    mfa_enrollment_required: true,
  }
  expect(routeDecision({ phase: 'authenticated', user }, 'overview', true)).toBe('security')
  expect(routeDecision({ phase: 'authenticated', user }, 'security', true)).toBeNull()
  expect(safeNext('https://outside.example')).toBe('overview')
  expect(safeNext('//outside.example')).toBe('overview')
  expect(safeNext('security')).toBe('security')
})

// 直接輸入servers網址也必須admin，不僅是隱藏導覽。
it('limits server management navigation to administrators', () => {
  const user = {
    id: 'fixture',
    username: 'fixture',
    role: 'operator' as const,
    totp_enabled: false,
    mfa_enrollment_required: false,
  }
  expect(routeDecision({ phase: 'authenticated', user }, 'servers', true)).toBe('overview')
  expect(
    routeDecision({ phase: 'authenticated', user: { ...user, role: 'admin' } }, 'servers', true),
  ).toBeNull()
})
