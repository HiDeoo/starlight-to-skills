import { styleText } from 'node:util'

import { getUserAgent, resolveCommand } from 'package-manager-detector'
import yoctoSpinner from 'yocto-spinner'

import { normalizeLineEndings } from './digest'
import { createError, StarlightToSkillsError } from './error'

const lineStartRegex = /^/gm

const startTerminalProgressSequence = '\u001B]9;4;3;0\u001B\\'
const stopTerminalProgressSequence = '\u001B]9;4;0;0\u001B\\'

export const style = {
  dim: (text: string) => styleText('dim', text),
  bold: (text: string) => styleText('bold', text),
  primary: (text: string) => styleText('cyan', text),
  success: (text: string) => styleText('green', text),
  hint: (text: string) => styleText('yellow', text),
  error: (text: string) => styleText(['bold', 'red'], text),
  section: (title: string) => styleText(['bold', 'inverse'], ` ${title} `),
  primarySection: (title: string) => styleText(['bold', 'bgCyan', 'black'], ` ${title} `),
  diffAdded: (text: string) => styleText('green', text),
  diffRemoved: (text: string) => styleText('red', text),
  diffChanged: (text: string) => styleText('inverse', text),
  command: (command: string) => `'${styleText('bold', resolveCommandWithPackageManager(command))}'`,
  skillName(name: string) {
    return `'${this.primary(name)}'`
  },
}

export function logMessage(message: string) {
  // eslint-disable-next-line no-console
  console.log(message)
}

export function logUsageError(error: unknown, command?: string): number {
  const helpCommand = command ? ` ${command}` : ''
  return logError(
    createError(formatError(error), {
      hint: `Run ${style.command(`starlight-to-skills${helpCommand} --help`)} for more information.`,
    }),
  )
}

export function logError(maybeError: unknown): number {
  console.error(`${style.error('Error:')} ${formatError(maybeError)}`)
  return 1
}

export function formatError(maybeError: unknown): string {
  const message =
    maybeError instanceof Error
      ? maybeError.message
      : typeof maybeError === 'string'
        ? maybeError
        : 'An unknown error occurred.'

  if (!(maybeError instanceof StarlightToSkillsError) || !maybeError.hint) {
    return message
  }

  return `${message}\n\n${style.hint('Hint:')} ${maybeError.hint}`
}

export function prefixLines(content: string, prefix: string) {
  return normalizeLineEndings(content).replaceAll(lineStartRegex, () => prefix)
}

export async function withProgress<T>(text: string, task: () => Promise<T>): Promise<T> {
  const spinner = yoctoSpinner({ text, spinner: { interval: 125, frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙'] } })
  // https://github.com/sindresorhus/yocto-spinner/blob/4e51ab9b8cc6a87d3a8d42c10d2e016fe88cfe29/index.js#L10-L12
  const isInteractive = process.stderr.isTTY && process.env['TERM'] !== 'dumb' && !('CI' in process.env)

  function stopTerminalProgress() {
    if (isInteractive) {
      process.stderr.write(stopTerminalProgressSequence)
    }
  }

  if (isInteractive) {
    process.once('exit', stopTerminalProgress)
    process.stderr.write(startTerminalProgressSequence)
  }

  try {
    spinner.start()
    return await task()
  } finally {
    spinner.stop()
    stopTerminalProgress()
    process.off('exit', stopTerminalProgress)
  }
}

export function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`
}

function resolveCommandWithPackageManager(command: string): string {
  const args = command.split(' ')
  const agent = getUserAgent() ?? 'npm'
  const resolvedCommand = resolveCommand(agent, 'execute-local', args) ?? resolveCommand('npm', 'execute-local', args)
  return resolvedCommand ? [resolvedCommand.command, ...resolvedCommand.args].join(' ') : command
}
