/**
 * Mock-only password hashing so the demo never stores plain passwords in localStorage.
 * NOT secure: the real backend hashes with Argon2/bcrypt on the server; the browser never
 * sees a hash.
 */
export const DEMO_PASSWORD = 'demo@123'

export function hashPassword(userId: string, password: string): string {
  // FNV-1a over "userId:password", two rounds with different seeds → 16 hex chars.
  const round = (seed: number) => {
    let h = seed
    for (const ch of `${userId}:${password}`) {
      h ^= ch.codePointAt(0)!
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  return `fnv$${round(0x811c9dc5)}${round(0x2a8b1f3d)}`
}

export interface Credential {
  userId: string
  passwordHash: string
  failedAttempts: number
  lockedUntil?: string
  /** One-time code for "Forgot password" (shown on screen in the demo, sent by SMS in the live system). */
  resetOtp?: { code: string; expiresAt: string; attempts: number }
  passwordChangedAt: string
}
