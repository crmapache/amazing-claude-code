import type { MenuOption } from './Menu'
import { anchorFrom, type Anchor } from './StatusBar'
import s from './shell.module.css'

/**
 * Saying thanks: a heart at the far end of the row opposite MODEL/EFFORT/MODE, and behind it the panel's
 * own dropdown with the two ways to do it - a star on GitHub or a review on the plugin's page.
 *
 * A link rather than a real star in one press: GitHub has no address that stars a repository by being
 * opened - it is a write to the account, and to do it from here the plugin would have to ask a person for
 * permission to write to their repositories. Trading that for a star is a bad bargain, so the button
 * honestly opens the page and the star is pressed there.
 *
 * Where the button stands is decided by the layout, not by this file: in bottom and compact it stands in
 * the selectors' row and repeats their frame, in left/right it stands in the rail's row of buttons and
 * repeats the attachment button beside it (see .thanks / .thanksRail and Composer.tsx).
 */

/** The addresses themselves - the menu carries only ids, the shell opens the address (see App.openThanks). */
export const THANKS_LINKS = {
  github: 'https://github.com/crmapache/amazing-claude-code',
  /* Straight to the reviews rather than to the plugin's front page: the errand here is to leave a rating,
     and the button to write one lives on that tab. */
  rate: 'https://plugins.jetbrains.com/plugin/33255-amazing-claude-code/reviews',
} as const

export type ThanksLink = keyof typeof THANKS_LINKS

/** Whatever the menu hands back is checked rather than trusted: an id from nowhere opens nothing. */
export const thanksUrl = (id: string): string | undefined => THANKS_LINKS[id as ThanksLink]

export const THANKS_MENU: { title: string; width: number; options: MenuOption[]; selected: string } = {
  title: 'SAY THANKS',
  width: 266,
  options: [
    {
      id: 'github',
      label: 'Star on GitHub',
      sub: 'Helps other people find the plugin',
      icon: '★',
      iconTone: 'warn',
    },
    {
      id: 'rate',
      label: 'Rate it on the plugin page',
      sub: 'A review in the JetBrains Marketplace',
      icon: '✎',
    },
  ],
  // Nothing is chosen here and nothing ever will be: both entries are errands rather than a state, and the
  // tick's column is taken up by their icons.
  selected: '',
}

interface ThanksButtonProps {
  /** The side rail's variant: no frame of its own, the same square as the attachment button next to it. */
  rail?: boolean
  onOpen: (anchor: Anchor) => void
}

export const ThanksButton = ({ rail = false, onOpen }: ThanksButtonProps) => (
  <button
    type="button"
    className={`${s.thanks} ${rail ? s.thanksRail : ''}`}
    /* A title rather than the panel's own data-tooltip, as the selectors beside it have: this hint would
       unfold upwards, into the very place the menu opens into, and cover it. */
    title="Enjoying the plugin? Say thanks"
    aria-label="Enjoying the plugin? Say thanks"
    onClick={(event) => onOpen(anchorFrom(event.currentTarget))}
  >
    <Heart />
  </button>
)

/** A solid heart: an outline one at 12px reads as a smudge rather than as a heart. */
const Heart = () => (
  <svg className={s.thanksIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 14.3l-.9-.85C3.4 10.1 1 7.95 1 5.4A3.55 3.55 0 0 1 4.6 1.8c1.3 0 2.55.6 3.4 1.57A4.4 4.4 0 0 1 11.4 1.8A3.55 3.55 0 0 1 15 5.4c0 2.55-2.4 4.7-6.1 8.06z"
      fill="currentColor"
    />
  </svg>
)
