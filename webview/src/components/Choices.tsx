import type { MenuOption } from './Menu'
import s from './sideMenu.module.css'

/**
 * A choice out of several named options, laid out as a screen rather than a dropdown.
 *
 * The sub-line under every option is the whole reason this is a screen: what "Accept edits" or "Don't
 * ask" actually permits takes a sentence to say, and in a popup that sentence was what pushed the menu
 * past the edge of the panel.
 */
export const ChoiceList = ({
  options,
  selected,
  note,
  onPick,
}: {
  options: MenuOption[]
  selected: string
  /**
   * A line above the list, for a choice that needs one - what this setting does not do, say. Inside the
   * list's own container rather than beside it: two `.screen` boxes stacked would pad twice.
   */
  note?: string
  onPick: (id: string) => void
}) => (
  <div className={`${s.screen} ${s.screenList}`}>
    {note ? <span className={`${s.screenNote} ${s.choiceNote}`}>{note}</span> : null}
    {options.map((option) => {
      const on = option.id === selected

      return (
        <button
          key={option.id}
          type="button"
          className={`${s.choice} ${on ? s.choiceOn : ''}`}
          disabled={option.disabled}
          onClick={() => onPick(option.id)}
        >
          <span className={s.choiceTick}>{on ? '✓' : ''}</span>
          <span className={s.choiceBody}>
            <span className={s.choiceTop}>
              <span className={`${s.choiceLabel} ${on ? s.choiceLabelOn : ''}`}>{option.label}</span>
              {option.tag ? (
                <span className={`${s.choiceTag} ${option.danger ? s.choiceTagDanger : ''}`}>{option.tag}</span>
              ) : null}
              {option.key ? <span className={s.choiceTag}>{option.key}</span> : null}
            </span>
            {option.sub ? <span className={s.choiceSub}>{option.sub}</span> : null}
          </span>
        </button>
      )
    })}
  </div>
)

/**
 * Where the input field sits, drawn rather than named.
 *
 * "Left" and "Right" say nothing about what will happen to the panel; a thumbnail of the layout says it
 * at a glance, and the choice is made once and rarely revisited - it is worth the room.
 */
export const LayoutChoice = ({
  options,
  selected,
  onPick,
}: {
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
}) => (
  <div className={s.screen}>
    <div className={s.layoutGrid}>
      {options.map((option) => {
        const on = option.id === selected

        return (
          <button
            key={option.id}
            type="button"
            className={`${s.layoutCard} ${on ? s.layoutCardOn : ''}`}
            onClick={() => onPick(option.id)}
          >
            <LayoutThumb layout={option.id} on={on} />
            <span className={`${s.layoutName} ${on ? s.layoutNameOn : ''}`}>{option.label}</span>
          </button>
        )
      })}
    </div>
  </div>
)

/** The panel in miniature: the feed as the large block, the input field as the highlighted one. */
const LayoutThumb = ({ layout, on }: { layout: string; on: boolean }) => {
  const field = on ? 'var(--acc-accent)' : 'var(--acc-bg-control)'

  return (
    <svg viewBox="0 0 100 52" aria-hidden="true" width="100%" height="52">
      <rect x="0.5" y="0.5" width="99" height="51" rx="4" fill="var(--acc-bg-deep)" stroke="var(--acc-line)" />
      {layout === 'bottom' ? (
        <>
          <rect x="7" y="6" width="86" height="27" rx="2" fill="var(--acc-bg-control)" opacity="0.55" />
          <rect x="7" y="37" width="86" height="9" rx="2" fill={field} />
        </>
      ) : null}
      {layout === 'compact' ? (
        <>
          <rect x="7" y="6" width="86" height="32" rx="2" fill="var(--acc-bg-control)" opacity="0.55" />
          <rect x="7" y="42" width="86" height="5" rx="2" fill={field} />
        </>
      ) : null}
      {layout === 'left' ? (
        <>
          <rect x="7" y="6" width="16" height="40" rx="2" fill={field} />
          <rect x="27" y="6" width="66" height="40" rx="2" fill="var(--acc-bg-control)" opacity="0.55" />
        </>
      ) : null}
      {layout === 'right' ? (
        <>
          <rect x="7" y="6" width="66" height="40" rx="2" fill="var(--acc-bg-control)" opacity="0.55" />
          <rect x="77" y="6" width="16" height="40" rx="2" fill={field} />
        </>
      ) : null}
    </svg>
  )
}
