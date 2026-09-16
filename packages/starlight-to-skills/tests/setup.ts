import { expect } from 'vitest'

const sha256Regex = /^[a-f\d]{64}$/

expect.extend({
  toBeSha256(this, received) {
    const pass = typeof received === 'string' && sha256Regex.test(received)

    return {
      pass,
      message: () => `expected ${this.utils.printReceived(received)} ${this.isNot ? 'not ' : ''}to be a SHA-256 digest`,
    }
  },
})

declare module 'vitest' {
  interface Matchers<T> {
    toBeSha256: () => T
  }
}
