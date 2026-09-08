import { useState } from 'react'
import { columns } from '../../catalog'
import type { MenuOption } from '../Menu'
import { Menu } from '../Menu'
import { anchorFrom, Selector, type Anchor } from '../StatusBar'

/**
 * One choice out of several, in the form of the panel's own selector.
 *
 * The same button and the same menu as MODEL, EFFORT and MODE under the input field - not for the
 * resemblance but because a native `select` does not work here at all: the panel is an offscreen browser
 * inside the IDE, and the list of a native picker simply never opens. Everything a form here chooses -
 * the shelf, the model, the effort, what a card is trusted with - goes through this.
 *
 * The menu is held here rather than handed up to the screen: it carries its own scrim and works out its
 * own place from the button (see Menu), so there is nothing for a parent to keep.
 */
export interface PickerProps {
  /** The word on the left of the button, in the place MODEL and EFFORT keep theirs. */
  label: string
  /** The head of the menu that opens - what is being chosen, in more words than fit on the button. */
  title: string
  value: string
  options: MenuOption[]
  onPick: (id: string) => void
  /** Wider than the selectors under the field: these options carry a sentence each. */
  width?: number
  className?: string
  /**
   * A shorter caption for the button, when the menu's own words are longer than a button wants.
   *
   * The menu names a mode in full ("Bypass permissions"); the button under the input field says
   * "Bypass" and has done since it was built - a caption of a sentence turns a row of three selectors
   * into a row that does not fit (see modeShortLabel). Given as a function rather than a ready caption
   * so that the reserve holding the width is measured by the same short words: given only the value,
   * the button would still be built to the width of the longest sentence in the menu.
   */
  short?: (option: MenuOption) => string
}

export const Picker = ({
  label,
  title,
  value,
  options,
  onPick,
  width = 280,
  className,
  short,
}: PickerProps) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const chosen = options.find((option) => option.id === value)
  const caption = (option: MenuOption): string => short?.(option) ?? option.label

  /*
   * The width is held by the longest option there is, invisible under the value (see Selector).
   *
   * A form of eight of these otherwise changes shape on every choice - and a row that moves while it is
   * being filled in is a row somebody loses their place in.
   *
   * Measured in columns rather than characters, like the samples under the input field: a Chinese caption
   * of three characters is six columns wide, and by length it built the button narrower than its own
   * value (see columns in catalog.ts).
   */
  const sample = options.reduce(
    (longest, option) => (columns(caption(option)) > columns(longest) ? caption(option) : longest),
    '',
  )

  /*
   * A shortened button says the full name on hover, and it is the only place left that says it at all.
   * Otherwise the hint is what the menu explains the choice with - never the caption the button already
   * carries, which is a hover spent on nothing and a line of the form covered while it is spent.
   */
  const shortened = chosen && caption(chosen) !== chosen.label
  const hint = shortened
    ? [chosen.label, chosen.sub].filter(Boolean).join('\n')
    : (chosen?.sub ?? chosen?.label ?? title)

  return (
    <>
      <Selector
        label={label}
        value={chosen ? caption(chosen) : value}
        sample={sample}
        hint={hint}
        className={className}
        onOpen={setAnchor}
      />

      {anchor ? (
        <Menu
          title={title}
          width={width}
          anchor={anchor}
          options={options}
          selected={value}
          onPick={(id) => {
            setAnchor(null)
            onPick(id)
          }}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  )
}

/** A button that opens a menu, measured from itself - the same anchor the selectors under the field use. */
export const anchorOf = anchorFrom
