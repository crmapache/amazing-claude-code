import s from './sideMenu.module.css'

interface AuthorCardProps {
  title: string
  body: string
  /** The heart that ends a thank-you. Only the card that asks for support wears one. */
  heart?: boolean
  /** The banner: a 2x file, cropped by the card into a fixed strip (see .authorShot). */
  shot: string
  /** The product's own name - the same in every language, so it arrives as a plain string. */
  name: string
  tagline: string
  url: string
  onOpenLink: (url: string) => void
}

/**
 * The author's other product, as a card at the foot of a screen.
 *
 * Deliberately unlike a menu row: every row above leads somewhere inside the panel, and an advertisement
 * dressed as one is an advertisement pretending to be part of the plugin. Hence a card of its own, with a
 * picture - a bare address asks to be trusted, a screenshot lets one decide before the click.
 *
 * One component for both places it stands (the menu's foot, the voice screen's foot): the second copy of
 * this markup would drift from the first on the first change to either.
 */
export const AuthorCard = ({ title, body, heart, shot, name, tagline, url, onOpenLink }: AuthorCardProps) => (
  <div className={s.author}>
    <div className={s.authorWords}>
      <span className={s.rowLabel}>{title}</span>
      <span className={s.authorBody}>
        {body}
        {heart ? (
          <svg className={s.authorHeart} viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 14.3l-.9-.85C3.4 10.1 1 7.95 1 5.4A3.55 3.55 0 0 1 4.6 1.8c1.3 0 2.55.6 3.4 1.57A4.4 4.4 0 0 1 11.4 1.8A3.55 3.55 0 0 1 15 5.4c0 2.55-2.4 4.7-6.1 8.06z"
              fill="currentColor"
            />
          </svg>
        ) : null}
      </span>
    </div>

    {/* The address goes to the shell rather than into an <a href>: this page has no browser of its own,
        so an ordinary navigation would carry the panel itself off to that site. */}
    <button type="button" className={s.authorSite} onClick={() => onOpenLink(url)}>
      {/* Decorative on purpose: the name and what it does are written right underneath, and a screen
          reader announcing the picture too would say the same thing twice. The measurements are the
          file's own - without them the row jumps as it decodes. */}
      <img className={s.authorShot} src={shot} alt="" width={608} height={182} decoding="async" />
      <span className={s.authorFoot}>
        <span className={s.authorNames}>
          <span className={s.authorName}>{name}</span>
          <span className={s.authorTagline}>{tagline}</span>
        </span>
        <svg className={s.authorArrow} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M5.4 10.6L10.6 5.4M6.2 5.2h4.6v4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  </div>
)
