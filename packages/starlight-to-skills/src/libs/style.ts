import { styleText } from 'node:util'

import yoctoSpinner from 'yocto-spinner'

const startTerminalProgressSequence = '\u001B]9;4;3;0\u001B\\'
const stopTerminalProgressSequence = '\u001B]9;4;0;0\u001B\\'

export function primary(text: string) {
  return styleText('cyan', text)
}

export function success(text: string) {
  return styleText('green', text)
}

export function hint(text: string) {
  return styleText('yellow', text)
}

export function error(text: string) {
  return styleText(['bold', 'red'], text)
}

export function dim(text: string) {
  return styleText('dim', text)
}

export function bold(text: string) {
  return styleText('bold', text)
}

export function section(title: string) {
  return styleText(['bold', 'bgWhite', 'black'], ` ${title} `)
}

export function primarySection(title: string) {
  return styleText(['bold', 'bgCyan', 'black'], ` ${title} `)
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
