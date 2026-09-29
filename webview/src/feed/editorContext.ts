import type { ContentBlock, EditorRef } from '../protocol'

/**
 * What the editor showed when a message went - the other half of EditorContext.kt, on the screen's side.
 *
 * The IDE writes it to the agent as a block of its own beside the person's text, in the words Claude Code
 * uses for the same note in a terminal. A live message carries the same thing as a field of its echo; a past
 * conversation has only the transcript, and this reads the block back out of it - otherwise the line under a
 * message would vanish the moment the conversation was reopened, although the agent read it all the same.
 */

const OPENED = /^<system-reminder>\nThe user opened the file (.+) in the IDE\. This may or may not be related/
const SELECTED = /^<system-reminder>\nThe user selected the lines (\d+) to (\d+) from (.+?)(?::\n| in the IDE - too long)/

/** The file's own name out of a path - either kind of slash, since a file outside the project keeps its whole path. */
const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/** The note in one text block of a person's record, when that block is the note. */
export const editorOfBlock = (text: string): EditorRef | undefined => {
  const selected = SELECTED.exec(text)
  if (selected) {
    const path = selected[3]!
    return { path, name: nameOf(path), from: Number(selected[1]), to: Number(selected[2]) }
  }

  const opened = OPENED.exec(text)
  if (opened) {
    const path = opened[1]!
    return { path, name: nameOf(path) }
  }

  return undefined
}

/**
 * The note among a person's record's blocks. Only a block that is nothing but the note counts: the same words
 * inside a message somebody typed are that person talking about it, not the IDE saying it.
 */
export const editorOfBlocks = (blocks: ContentBlock[]): EditorRef | undefined => {
  for (const block of blocks) {
    if (block.type !== 'text') continue
    const found = editorOfBlock(block.text)
    if (found) return found
  }
  return undefined
}

/** The lines as they are written after a name: `12-18`, or `12` for a single one. Empty with nothing selected. */
export const editorLines = (ref: EditorRef): string => {
  if (ref.from === undefined || ref.to === undefined) return ''
  return ref.from === ref.to ? `${ref.from}` : `${ref.from}-${ref.to}`
}

/** What the chip in the field and the line under a card say: the name, and the lines after a colon. */
export const editorLabel = (ref: EditorRef): string => {
  const lines = editorLines(ref)
  return lines ? `${ref.name}:${lines}` : ref.name
}

/**
 * The same file with the same lines - what a "not with this message" is remembered by (see App's
 * editorSkips). Selecting other lines, or opening another file, is a new thing on screen, and it goes with
 * the next message again unless switched off anew.
 */
export const editorKey = (ref: EditorRef): string => `${ref.path}#${ref.from ?? ''}-${ref.to ?? ''}`
