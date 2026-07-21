import { z } from 'astro/zod'

export class StarlightToSkillsError extends Error {
  readonly hint?: string | undefined

  constructor(message: string, options: StarlightToSkillsErrorOptions = {}) {
    const details =
      options.cause !== undefined && options.withCause !== false
        ? StarlightToSkillsError.#getCauseDetails(options.cause)
        : undefined

    super(details ? `${message}\n\n${details}` : message, options)

    this.name = 'StarlightToSkillsError'
    this.hint = options.hint
  }

  static #getCauseDetails(cause: unknown) {
    if (cause instanceof z.ZodError) return z.prettifyError(cause)
    if (cause instanceof Error) return cause.message
    if (typeof cause === 'string') return cause
    return
  }
}

export function createError(message: string, options?: StarlightToSkillsErrorOptions): StarlightToSkillsError {
  return new StarlightToSkillsError(message, options)
}

export function throwError(message: string, options?: StarlightToSkillsErrorOptions): never {
  throw createError(message, options)
}

interface StarlightToSkillsErrorOptions extends ErrorOptions {
  hint?: string
  withCause?: boolean
}
