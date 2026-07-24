import { diffLinesUnified, diffStringsUnified, type DiffOptions } from 'jest-diff'

import type { SkillFile } from './content'
import { normalizeLineEndings } from './digest'
import { style } from './terminal'

// TODO(HiDeoo) non diff generate output should be indented like a diff

// https://github.com/jestjs/jest/blob/f49721c78e195558b40913977c9230f5b7f559d8/packages/jest-diff/README.md?plain=1#L114
const maxCharacterDiffLength = 20_000

export function renderSkillDiff(approvedFiles: SkillFile[], candidateFiles: SkillFile[]) {
  const filesByPath = new Map<string, { approved?: SkillFile; candidate?: SkillFile }>(
    candidateFiles.map((candidate) => [candidate.path, { candidate }]),
  )

  for (const approved of approvedFiles) {
    filesByPath.set(approved.path, { ...filesByPath.get(approved.path), approved })
  }

  return [...filesByPath.values()]
    .map(({ approved, candidate }) => renderSkillFileDiff(approved, candidate))
    .join('\n\n')
}

function renderSkillFileDiff(approvedFile?: SkillFile, candidateFile?: SkillFile) {
  const path = candidateFile?.path ?? approvedFile?.path
  if (!path) throw new Error('Expected an approved or generated skill file.')

  const approvedContent = approvedFile && normalizeLineEndings(approvedFile.content)
  const candidateContent = candidateFile && normalizeLineEndings(candidateFile.content)

  let content: string

  if (approvedContent === undefined) {
    content = prefixDiffLines(candidateContent ?? '', '+', style.diffAdded)
  } else if (candidateContent === undefined) {
    content = prefixDiffLines(approvedContent, '-', style.diffRemoved)
  } else {
    const options: DiffOptions = {
      aColor: style.diffRemoved,
      bColor: style.diffAdded,
      changeColor: style.diffChanged,
      commonColor: (text) => text,
      omitAnnotationLines: true,
    }

    content =
      approvedContent.length <= maxCharacterDiffLength && candidateContent.length <= maxCharacterDiffLength
        ? diffStringsUnified(approvedContent, candidateContent, options)
        : diffLinesUnified(approvedContent.split('\n'), candidateContent.split('\n'), options)
  }

  return `${style.section(path)}\n\n${content}`
}

function prefixDiffLines(content: string, indicator: '+' | '-', color: (text: string) => string) {
  return content
    .split('\n')
    .map((line) => color(`${indicator} ${line}`))
    .join('\n')
}
