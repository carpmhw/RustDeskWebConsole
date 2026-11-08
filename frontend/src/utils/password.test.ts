import { expect, it } from 'vitest'
import { generatePassword, PASSWORD_ALPHABET } from './password'

// 預設 20 字元且只使用允許字元集。
it('generates 20 characters from the allowed alphabet', () => {
  const value = generatePassword()
  expect(value).toHaveLength(20)
  expect([...value].every((character) => PASSWORD_ALPHABET.includes(character))).toBe(true)
})

// 大量產生不重複，代表使用密碼學亂數而非固定序列。
it('does not repeat across many generations', () => {
  const values = new Set(Array.from({ length: 1000 }, () => generatePassword()))
  expect(values.size).toBe(1000)
})

// 低於系統最小長度時拒絕產生。
it('rejects lengths below the password policy', () => {
  expect(() => generatePassword(11)).toThrow()
  expect(generatePassword(12)).toHaveLength(12)
})
