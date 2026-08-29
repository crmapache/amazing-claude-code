import type { MenuOption } from './Menu'
import { anchorFrom, type Anchor } from './StatusBar'
import s from './shell.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'

/**
 * Saying thanks: a heart at the far end of the row opposite MODEL/EFFORT/MODE, and behind it the panel's
 * own dropdown with the three ways to do it - a star on GitHub, a review on the plugin's page, or a word
 * to somebody who has not heard of it.
 *
 * A link rather than a real star in one press: GitHub has no address that stars a repository by being
 * opened - it is a write to the account, and to do it from here the plugin would have to ask a person for
 * permission to write to their repositories. Trading that for a star is a bad bargain, so the button
 * honestly opens the page and the star is pressed there.
 *
 * Where the button stands is decided by the layout, not by this file: in bottom and compact it stands at
 * the end of the selectors' row, in left/right it stands in the rail's row of buttons. The same box either
 * way, framed in the row and borderless in the rail (see .thanks / .thanksRail and Composer.tsx).
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

/** The id of the entry that copies rather than opens - the one errand here with no address of its own. */
export const SHARE = 'share'

/**
 * What lands in the clipboard, ready to be pasted into a chat with somebody.
 *
 * Written as a person would write it rather than as a plugin would advertise itself - it goes out under
 * somebody's own name, in their own conversation, and a line of marketing pasted there embarrasses the
 * person who pasted it. The address is the plugin's front page rather than the reviews tab: whoever reads
 * this has not seen the thing yet, and the first thing they should meet is what it is.
 */
export const shareText = (t: Dict): string => t.thanks.shareText

/**
 * The menu behind the heart. [copied] is the answer to a press on the last entry: the clipboard cannot be
 * looked into, and a menu that simply closed on a press would leave "did that do anything?" hanging - the
 * other two entries answer for themselves by a browser window opening.
 */
export const thanksMenu = (
  t: Dict,
  copied: boolean,
): { title: string; width: number; options: MenuOption[]; selected: string } => ({
  title: t.thanks.title,
  width: 266,
  options: [
    {
      id: 'github',
      label: t.thanks.star,
      sub: t.thanks.starSub,
      icon: '★',
      iconTone: 'warn',
    },
    {
      id: 'rate',
      label: t.thanks.rate,
      sub: t.thanks.rateSub,
      icon: '✎',
    },
    {
      id: SHARE,
      label: t.thanks.share,
      sub: copied ? t.thanks.shareCopied : t.thanks.shareSub,
      // An arrow leaving the corner: the two above lead somewhere, this one hands something over.
      icon: '↗',
    },
  ],
  // Nothing is chosen here and nothing ever will be: the entries are errands rather than a state, and the
  // tick's column is taken up by their icons.
  selected: '',
})

interface ThanksButtonProps {
  /** The side rail's variant: no frame of its own - it stands among borderless buttons rather than capsules. */
  rail?: boolean
  /** Compact: the heart shares a row with MODEL/EFFORT/MODE and takes their height (see .thanksLevel). */
  withSelectors?: boolean
  onOpen: (anchor: Anchor) => void
}

export const ThanksButton = ({ rail = false, withSelectors = false, onOpen }: ThanksButtonProps) => {
  const t = useT()

  return (
  <button
    type="button"
    className={`${s.thanks} ${rail ? s.thanksRail : ''} ${withSelectors ? s.thanksLevel : ''}`}
    /* A title rather than the panel's own data-tooltip, as the selectors beside it have: this hint would
       unfold upwards, into the very place the menu opens into, and cover it. */
    title={t.thanks.button}
    aria-label={t.thanks.button}
    onClick={(event) => onOpen(anchorFrom(event.currentTarget))}
  >
    <Heart />
  </button>
  )
}

/** A solid heart: an outline one at this size reads as a smudge rather than as a heart. */
const Heart = () => (
  <svg className={s.thanksIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 14.3l-.9-.85C3.4 10.1 1 7.95 1 5.4A3.55 3.55 0 0 1 4.6 1.8c1.3 0 2.55.6 3.4 1.57A4.4 4.4 0 0 1 11.4 1.8A3.55 3.55 0 0 1 15 5.4c0 2.55-2.4 4.7-6.1 8.06z"
      fill="currentColor"
    />
  </svg>
)
