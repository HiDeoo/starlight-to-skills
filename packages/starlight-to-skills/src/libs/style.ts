import { styleText } from 'node:util'

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
