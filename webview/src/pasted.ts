import { send } from './bridge'
import type { ShellMessage } from './protocol'

/**
 * Anything pasted from the clipboard that has bytes but no file - a screenshot, a document - kept as a
 * file by the IDE.
 *
 * Such bytes have no place on disk of their own: they live inside the message and travel to the agent as
 * an attachment. On screen that is a chip saying "Image #3", and copying such a message put exactly that
 * caption into the clipboard - a name for something nobody can open, send or point at. So the bytes go to
 * the shell, which writes them out (see PastedFiles.kt) and answers with a path; from then on the
 * attachment behaves like any other file.
 *
 * A pasted picture still travels to the agent as bytes as well. The file is for the person: reading it
 * back would cost a tool call and a permission for something the agent has already been handed.
 */

/**
 * How long the shell's answer is waited for.
 *
 * Generous on purpose: a screenshot off a large display is megabytes to decode and write, and the answer
 * only decides whether the chip carries a path. Nothing on screen waits for it - the chip is inserted
 * either way, and a paste that quietly did nothing would be far worse than one without a path.
 */
const SAVE_TIMEOUT_MS = 5_000

let lastRequest = 0
const pending = new Map<string, (path: string) => void>()

/** The bytes of a data URL, split into what the shell needs: the type and the base64 body. */
const DATA_URL = /^data:([^;]+);base64,(.+)$/

/**
 * Ask the shell to keep this as a file. Answers with the path, or with nothing at all - no path is an
 * ordinary outcome (an older IDE, a full disk, a shell that never answered), and everything above works
 * without one.
 *
 * `name` is what the clipboard called it: a document keeps its own name, a screenshot has none.
 */
export const savePastedFile = (dataUrl: string, name = ''): Promise<string> => {
  const match = DATA_URL.exec(dataUrl)
  const mediaType = match?.[1]
  const data = match?.[2]
  if (!mediaType || !data) return Promise.resolve('')

  lastRequest += 1
  const id = `paste-${lastRequest}`

  return new Promise<string>((resolve) => {
    const finish = (path: string) => {
      if (!pending.delete(id)) return
      clearTimeout(timeout)
      resolve(path)
    }

    const timeout = setTimeout(() => finish(''), SAVE_TIMEOUT_MS)

    pending.set(id, finish)
    send({ type: 'savePastedFile', id, name, mediaType, data })
  })
}

/** The shell's answer - called from the shared message handling, exactly as the clipboard's is. */
export const resolvePastedFile = (message: Extract<ShellMessage, { type: 'pastedFile' }>): void => {
  pending.get(message.id)?.(message.path ?? '')
}

/**
 * Every file the clipboard held, kept on disk - the paths in the order they were pasted.
 *
 * This is what makes a document pasteable at all. The browser hands over a file's bytes and its name and
 * never its path (a page must not learn where things live on the machine), so a paste that is neither
 * text nor a picture used to do nothing whatsoever: the panel had bytes it could not name and nowhere to
 * put them. Written out, they become an ordinary attachment - a path the agent can read and a person can
 * copy.
 *
 * Files the shell could not keep are left out rather than standing as empty strings: a path that leads
 * nowhere is worse than an attachment that plainly did not arrive.
 */
export const savePastedFiles = async (files: File[]): Promise<string[]> => {
  const saved = await Promise.all(files.map(async (file) => savePastedFile(await readDataUrl(file), file.name)))

  return saved.filter((path) => path !== '')
}

/** A file as a data URL - the one shape bytes travel to the shell in (see savePastedFile). */
const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
