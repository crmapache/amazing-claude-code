import { useMemo } from 'react'
import type { Dict } from '../i18n/en'
import {
  TEXT_SIZE_FOLLOW,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  drawnSize,
  formatPoints,
  ownTextSize,
  stepTextSize,
  type TextSize,
} from '../textSize'
import type { ThemeChoice } from '../theme'
import { canvasMeasure, cssFamily, monospacedFamilies } from '../fontFamilies'
import { ChoiceList, ChoiceOption } from './Choices'
import s from './sideMenu.module.css'

/**
 * How the panel looks: its text size, its font and its theme.
 *
 * The size stands first, and for a reason of geometry rather than importance: it is applied by zooming the
 * whole page (see IdeTypography.kt), this screen included, and a control moves under the pointer by as
 * much as it stands away from the top of the panel. At the top the buttons barely shift from one size to
 * the next; under three rows of themes they would jump a finger's width per point.
 *
 * Both halves are choices of the kind the other screens make - a tick, a name, a sentence - and the
 * second size carries its own figure, the way the folding of a paste carries its number (see
 * PasteCollapse). Nothing here needs a preview: a press repaints or resizes the panel the screen sits in.
 */
export const Appearance = ({
  t,
  size,
  fontFamily,
  consoleFont,
  theme,
  ideDark,
  onTextSize,
  onFontFamily,
  onOpenFonts,
  onTheme,
}: {
  t: Dict
  size: TextSize
  /** The panel's own font, or empty while it follows the console's. */
  fontFamily: string
  consoleFont: string
  theme: ThemeChoice
  ideDark: boolean
  onTextSize: (size: number) => void
  onFontFamily: (font: string) => void
  /** The list of fonts, a screen of its own (see FontFamilies): a few dozen names do not fit in a row. */
  onOpenFonts: () => void
  onTheme: (theme: ThemeChoice) => void
}) => {
  const following = size.chosen === TEXT_SIZE_FOLLOW
  const drawn = drawnSize(size)
  const followingFont = fontFamily === ''

  return (
    <div className={`${s.screen} ${s.screenList}`}>
      <span className={`${s.screenLabel} ${s.listLabel}`}>{t.appearance.size}</span>

      <ChoiceOption
        option={{
          id: 'follow',
          label: t.appearance.followConsole,
          sub: t.appearance.followConsoleSub(formatPoints(size.console)),
        }}
        on={following}
        onPick={() => onTextSize(TEXT_SIZE_FOLLOW)}
      />

      {/* A row rather than a button, because it holds buttons of its own - the same shape as the folding
          of a paste. The half that chooses covers everything but the figure. */}
      <div className={`${s.choice} ${s.choiceField} ${following ? '' : s.choiceOn}`}>
        <button type="button" className={s.choiceHit} onClick={() => onTextSize(ownTextSize(size))}>
          <span className={s.choiceTick}>{following ? '' : '✓'}</span>
          <span className={s.choiceBody}>
            <span className={s.choiceTop}>
              <span className={`${s.choiceLabel} ${following ? '' : s.choiceLabelOn}`}>{t.appearance.own}</span>
            </span>
            <span className={s.choiceSub}>{t.appearance.ownSub}</span>
          </span>
        </button>

        {/* Live while the console's size is followed, rather than greyed out: a press on either button
            is itself the choice to stop following, and a figure one has to unlock first is a figure
            nobody finds. */}
        <div className={s.stepper}>
          <button
            type="button"
            className={s.stepperButton}
            aria-label={t.appearance.smaller}
            data-tooltip={t.appearance.smaller}
            disabled={drawn <= TEXT_SIZE_MIN}
            onClick={() => onTextSize(stepTextSize(size, -1))}
          >
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className={`${s.stepperValue} ${following ? s.stepperValueFollowing : ''}`}>{formatPoints(drawn)}</span>
          <button
            type="button"
            className={s.stepperButton}
            aria-label={t.appearance.larger}
            data-tooltip={t.appearance.larger}
            disabled={drawn >= TEXT_SIZE_MAX}
            onClick={() => onTextSize(stepTextSize(size, 1))}
          >
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <path d="M2.5 6h7M6 2.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <span className={`${s.screenLabel} ${s.listLabel} ${s.listLabelNext}`}>{t.appearance.font}</span>

      <ChoiceOption
        option={{
          id: 'followFont',
          label: t.appearance.followConsoleFont,
          sub: t.appearance.followConsoleFontSub(consoleFont),
        }}
        on={followingFont}
        onPick={() => onFontFamily('')}
      />
      {/* The choice is made on the list behind this row: a font of one's own means nothing until it is named,
          so the row opens the list rather than switching to some font nobody picked. */}
      <ChoiceOption
        option={{
          id: 'ownFont',
          label: t.appearance.ownFont,
          sub: followingFont ? t.appearance.ownFontSub : t.appearance.ownFontChosen(fontFamily),
        }}
        on={!followingFont}
        onPick={onOpenFonts}
      />

      <span className={`${s.screenLabel} ${s.listLabel} ${s.listLabelNext}`}>{t.appearance.theme}</span>

      {/* "As in the IDE" says what it amounts to today, the way the language's "Automatic" names the
          IDE's language: an entry that promises something unnamed makes one open the IDE's settings to
          find out what was chosen. */}
      <ChoiceOption
        option={{
          id: '',
          label: t.appearance.followIde,
          sub: t.appearance.followIdeSub(ideDark ? t.appearance.darkWord : t.appearance.lightWord),
        }}
        on={theme === ''}
        onPick={() => onTheme('')}
      />
      <ChoiceOption
        option={{ id: 'dark', label: t.appearance.dark, sub: t.appearance.darkSub }}
        on={theme === 'dark'}
        onPick={() => onTheme('dark')}
      />
      <ChoiceOption
        option={{ id: 'light', label: t.appearance.light, sub: t.appearance.lightSub }}
        on={theme === 'light'}
        onPick={() => onTheme('light')}
      />
    </div>
  )
}

/** The value beside the row in the settings list: the theme's word and the size drawn - "Auto · 13 pt". */
export const appearanceSummary = (t: Dict, theme: ThemeChoice, size: TextSize): string => {
  const word = theme === 'dark' ? t.appearance.dark : theme === 'light' ? t.appearance.light : t.appearance.auto

  return `${word} · ${formatPoints(drawnSize(size))}`
}

/**
 * The fonts the panel can be set in - monospaced ones its browser can draw (see fontFamilies.ts), each name
 * written in its own face, so the list is its own preview. The tick stands on the font the feed is set in now:
 * the console's while it is followed.
 */
export const FontFamilies = ({
  t,
  families,
  fontFamily,
  consoleFont,
  onPick,
}: {
  t: Dict
  /** Every family the machine has, as the IDE named them - null until it has answered. */
  families: string[] | null
  fontFamily: string
  consoleFont: string
  onPick: (font: string) => void
}) => {
  const fonts = useMemo(() => {
    const measure = canvasMeasure()
    return families && measure ? monospacedFamilies(families, measure) : null
  }, [families])

  if (!fonts) {
    return (
      <div className={s.screen}>
        <div className={s.screenEmpty}>{t.common.loading}</div>
      </div>
    )
  }

  return (
    <ChoiceList
      options={fonts.map((name) => ({ id: name, label: name, labelFont: `${cssFamily(name)}, monospace` }))}
      selected={fontFamily || consoleFont}
      note={t.appearance.fontsNote}
      onPick={onPick}
    />
  )
}
