import { useEffect, useRef, useState } from 'react'
import s from './sideMenu.module.css'

interface ImprovePromptProps {
  /** What the person put in themselves. Empty means the built-in text below is in force. */
  instructions: string
  /** The built-in text - the placeholder, and what the button here puts back. */
  builtIn: string
  onChange: (text: string) => void
}

/**
 * The screen behind "Improve prompt" in the menu: the words the sparkle button beside the paperclip asks
 * by.
 *
 * The built-in text stands in the field as its placeholder rather than as its value, and that is the whole
 * design of this screen. Stored as a value it would be a copy: the day the built-in text improves, everyone
 * who once opened this screen would keep the old one, for no reason they could ever guess at. Stored as
 * nothing, with the placeholder saying what nothing means, the default stays a default and is still
 * readable - which is what makes it worth editing rather than guessing about.
 *
 * Saved on leaving the field rather than on every keystroke: this goes into the IDE's settings, and a
 * setting rewritten thirty times a sentence is thirty writes for one decision.
 */
export const ImprovePrompt = ({ instructions, builtIn, onChange }: ImprovePromptProps) => {
  const [text, setText] = useState(instructions)
  const field = useRef<HTMLTextAreaElement>(null)

  // The settings can change from elsewhere - a second window of the same project, the same IDE reopened.
  useEffect(() => setText(instructions), [instructions])

  const save = (next: string) => {
    setText(next)
    if (next.trim() !== instructions.trim()) onChange(next.trim())
  }

  const custom = text.trim() !== ''

  return (
    <div className={s.screen}>
      <span className={s.screenNote}>
        The sparkle button beside the paperclip rewrites what stands in the input field. This is what it
        asks for, and it is sent together with the draft to a Claude Code run of its own - no tools, no
        project files, no conversation, nothing written anywhere. It counts against your usage like any
        other message.
      </span>

      <div className={s.field}>
        <span className={s.screenLabel}>INSTRUCTIONS</span>
        <textarea
          ref={field}
          className={s.instructions}
          value={text}
          placeholder={builtIn}
          spellCheck
          onChange={(event) => setText(event.target.value)}
          onBlur={() => save(text)}
        />
        <span className={s.screenNote}>
          Empty means the text shown above in grey - the one the button uses out of the box. Whatever you
          put here replaces it whole.
        </span>
        <span className={s.screenNote}>
          Pressing the button again on a draft it has just rewritten starts over from what you originally
          wrote, rather than rewriting its own answer - so a second press is another attempt, not a second
          pass. The answers you pressed past go along with it, as things to steer away from. Edit the field
          yourself and that becomes the new starting point.
        </span>
      </div>

      <div className={s.inputRow}>
        <button
          type="button"
          className={s.button}
          onClick={() => {
            // Two buttons in one, and which it is is never in doubt: an empty field has the built-in text
            // in force and offers to open it for editing, a filled one offers to give it back. Copying it
            // in is a real copy - from then on it is this person's text and stops following ours - and
            // that is exactly what somebody asking to edit it is asking for.
            if (custom) save('')
            else {
              save(builtIn)
              field.current?.focus()
            }
          }}
        >
          {custom ? 'Back to the built-in text' : 'Edit the built-in text'}
        </button>
      </div>
    </div>
  )
}
