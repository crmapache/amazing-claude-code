import type { Dict } from '../i18n/en'
import { endsOpen } from './tokens'
import type { UserToken } from './types'

/**
 * Where a dictated phrase lands in the draft.
 *
 * Small rules, and every one of them is the kind that breaks silently: a missing space glues two
 * sentences into one word, a stray one leaves a gap in front of a comma, and either is only ever noticed
 * after the message has gone. So they live here with a test on them rather than inside a component.
 *
 * Phrases arrive one after another while somebody is speaking, and each is appended to the end of the
 * draft rather than at the caret. That is the rule people expect - dictation continues what has been
 * said - and it is also the only one that survives the caret being somewhere else entirely: the field
 * may not even have the focus, because the hotkey works from the editor.
 */

/**
 * The draft with [phrase] added to it.
 *
 * The same array comes back when there is nothing to add, so a caller can compare by identity: an empty
 * final phrase is an ordinary thing to receive - it is what Deepgram sends for a pause it decided was
 * the end of a sentence.
 */
export const voiceAppend = (tokens: UserToken[], phrase: string): UserToken[] => {
  const words = phrase.trim()
  if (words === '') return tokens

  const last = tokens[tokens.length - 1]

  // A chip is a thing rather than a character: a phrase said after one always needs the space, and
  // there is no last character to ask about.
  if (!last || last.kind === 'chip') {
    return tokens.length === 0
      ? [{ kind: 'text', value: words }]
      : [...tokens, { kind: 'text', value: ` ${words}` }]
  }

  return replaceLast(tokens, { ...last, value: voiceJoin(last.value, words) })
}

/**
 * The same rule for a draft that is plain text - which is what the phone's field holds (see
 * mobile/screens/Composer): there are no chips there, so a string is the whole of it.
 *
 * One rule rather than two, because it is the kind that goes wrong in a way nobody sees until the
 * message has gone: a missing space glues two sentences into one word.
 */
export const voiceJoin = (before: string, phrase: string): string => {
  const words = phrase.trim()
  if (words === '') return before

  // Nothing written yet, or a line just broken: the phrase starts where the caret already stands.
  if (!endsOpen(before)) return before + words

  // Han, kana and Thai run their words together. A space dropped between two of them is a space in the
  // middle of a word: it travels to the agent inside the prompt, and on screen it argues with the rule
  // that takes the letter-spacing off CJK text (see base.css).
  if (endsRunOn.test(before) && startsRunOn.test(words)) return before + words

  return `${before} ${words}`
}

/**
 * The scripts that write without spaces between words: Han, kana and Thai.
 *
 * Every one of them the language picker offers (see VoiceLanguages), and no more than that: hangul is
 * deliberately absent, because Korean spaces its words exactly as English does. Asked of both sides of
 * the join rather than of the phrase alone - an English sentence followed by a Japanese one still wants
 * the space, and so does the other way round.
 */
const RUN_ON =
  '\u0E00-\u0E7F\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFF65'

const endsRunOn = new RegExp(`[${RUN_ON}]$`, 'u')
const startsRunOn = new RegExp(`^[${RUN_ON}]`, 'u')

/**
 * Whether the tail said so far is worth showing beside the caret.
 *
 * Deepgram sends an empty interim result at every pause, and a grey ghost that blinks in and out on
 * every breath is worse than no ghost at all.
 */
export const voiceGhost = (interim: string): string => interim.trim()

/**
 * What went wrong, in the panel's own language.
 *
 * The IDE sends a code rather than a sentence (see VoiceDictation.State) because it has one language and
 * this side has nine. Each code is a different thing to do about it: add a key, switch the feature on,
 * find out what else is holding the microphone, fix the key, look at the network, try again later.
 *
 * `remote` is the phone asking. Two of the answers change there and both would otherwise send somebody
 * looking in the wrong place: the key and the switch live in the IDE at the desk, and a phone has no
 * screen for either. `off` only ever reaches a phone at all - at the desk a switched-off feature has no
 * button to press (see VoiceGrant).
 *
 * Anything unrecognised falls back to the general one rather than being shown raw: a code on screen is
 * worse than a vague sentence, and a new code is a thing to translate rather than to leak.
 */
export const voiceMessage = (t: Dict, code: string, remote = false): string => {
  switch (code) {
    case 'no-key':
      return remote ? t.voice.errorNoKeyRemote : t.voice.errorNoKey
    case 'off':
      return t.voice.errorOff
    case 'mic':
      return t.voice.errorMicrophone
    case 'key':
      return t.voice.errorKey
    case 'network':
      return t.voice.errorNetwork
    default:
      return t.voice.errorGeneral
  }
}

const replaceLast = (tokens: UserToken[], last: UserToken): UserToken[] => [...tokens.slice(0, -1), last]
