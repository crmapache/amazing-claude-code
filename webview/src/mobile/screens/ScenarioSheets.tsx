import { formatDuration } from '../../feed/tools'
import { useTicking } from '../../hooks/useTicking'
import { useLocale, useT } from '../../i18n'
import type { Scenario, ScenarioRepeat, ScenarioSchedule } from '../../protocol'
import { missingInputs } from '../../scenarios/rules'
import { HOURS, MINUTES, pad2, WEEKDAYS, weekdayName, whenLabel } from '../../scenarios/schedule'
import { nextDue } from '../../scenarios/due'
import { countdown } from '../../scenarios/timetable'
import { Sheet } from './Sheet'
import { shelfLabel, type RepositoryChoice, type ShelfChoice } from '../scenarios'
import m from '../mobile.module.css'

/**
 * The four sheets the scenarios screen folds up from the bottom.
 *
 * A sheet rather than a screen wherever the answer is "say this and come back": a screen costs the way
 * back and the loss of what was behind it, which are the two things a phone is worst at. The editor and
 * one card are screens because they are long; a ticket, an hour and a sentence are not.
 *
 * They live together because they are read together - four short forms about one row - and because every
 * one of them ends in the same pair of decisions: what it will run with, and whether to run it at all.
 */

/** Everything one does to a scenario, as words in a sheet rather than icons on a row. */
export const ScenarioActionsSheet = ({
  scenario,
  hours,
  onRun,
  onSchedule,
  onEdit,
  onDuplicate,
  onDelete,
  onClose,
}: {
  scenario: Scenario
  hours: ScenarioSchedule[]
  onRun: () => void
  onSchedule: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}) => {
  const t = useT()
  const asks = scenario.inputs.map((input) => input.name).filter((name) => name.trim().length > 0)

  return (
    <Sheet
      title={scenario.name}
      meta={[
        scenario.scope === 'project' ? t.scenarios.editor.inRepository : t.scenarios.editor.mine,
        t.scenarios.stages(scenario.stages.length),
      ].join(' · ')}
      onClose={onClose}
    >
      <button type="button" className={m.sheetAction} onClick={onRun}>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.scenarios.row.runNow}</span>
        </span>
        {asks.length > 0 ? (
          <span className={m.sheetActionHint}>{t.mobile.scenarios.row.asksFirst(asks.join(', '))}</span>
        ) : null}
      </button>

      <button type="button" className={m.sheetAction} onClick={onSchedule}>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.scenarios.row.schedule}</span>
        </span>
        {hours.length > 0 ? (
          <span className={m.sheetActionHint}>{t.mobile.scenarios.row.scheduled(hours.length)}</span>
        ) : null}
      </button>

      <button type="button" className={m.sheetAction} onClick={onEdit}>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.scenarios.row.editor}</span>
        </span>
        <span className={m.taskRowChevron}>›</span>
      </button>

      <button type="button" className={m.sheetAction} onClick={onDuplicate}>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.scenarios.row.duplicate}</span>
        </span>
      </button>

      {/*
        The one irreversible thing on this sheet, and it is a word rather than an icon on a row: a cross
        beside a name is pressed by a thumb aiming at the name.
      */}
      <button
        type="button"
        className={`${m.sheetAction} ${m.sheetActionDanger}`}
        onClick={() => {
          if (window.confirm(`${t.scenarios.deleteTitle}\n\n${scenario.name}`)) onDelete()
        }}
      >
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.scenarios.row.delete}</span>
        </span>
      </button>
    </Sheet>
  )
}

/** What the scenario asks before it starts, and what starting it would mean right now. */
export const StartSheet = ({
  scenario,
  values,
  last,
  going,
  onChange,
  onRun,
  onClose,
}: {
  scenario: Scenario
  values: Record<string, string>
  last: Record<string, string>
  /** How many runs are already going over this working copy - said before the button, not after. */
  going: number
  onChange: (values: Record<string, string>) => void
  onRun: () => void
  onClose: () => void
}) => {
  const t = useT()
  const missing = missingInputs(scenario, values)

  return (
    <Sheet
      title={t.mobile.scenarios.start.title}
      meta={scenario.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={m.buttonPrimary} disabled={missing.length > 0} onClick={onRun}>
            {t.mobile.scenarios.start.run}
          </button>
          <button type="button" className={m.buttonSecondary} onClick={onClose}>
            {t.common.cancel}
          </button>
        </>
      }
    >
      {scenario.inputs.map((input) => (
        <div key={input.id} className={m.formRow}>
          <span className={m.sheetLabelRow}>
            <span className={m.sheetLabelInline}>{input.label || input.name}</span>
            {input.required ? (
              <span className={m.sheetRequired}>{t.mobile.scenarios.start.required}</span>
            ) : null}
          </span>
          <input
            className={m.input}
            value={values[input.name] ?? ''}
            placeholder={input.placeholder}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => onChange({ ...values, [input.name]: event.target.value })}
          />
          {/* What the last run used, under the field rather than inside it: a placeholder that looks
              like an answer is an answer somebody sends without meaning to. */}
          {last[input.name] && last[input.name] !== (values[input.name] ?? '') ? (
            <span className={m.formNote}>{t.mobile.scenarios.start.lastUsed(last[input.name])}</span>
          ) : null}
        </div>
      ))}

      {going > 0 ? <p className={m.sheetNote}>{t.mobile.scenarios.start.beside(going)}</p> : null}
    </Sheet>
  )
}

/** When it should start by itself, how often, and with what - because at that hour nobody is here. */
export const HourSheet = ({
  scenario,
  editing,
  hour,
  values,
  onHour,
  onValues,
  onSet,
  onClear,
  onClose,
}: {
  scenario: Scenario
  editing: boolean
  hour: { at: number; repeat: ScenarioRepeat; weekday: number }
  values: Record<string, string>
  onHour: (hour: { at: number; repeat: ScenarioRepeat; weekday: number }) => void
  onValues: (values: Record<string, string>) => void
  onSet: () => void
  /** Only for one that already exists - a new arrangement has nothing to take back. */
  onClear?: () => void
  onClose: () => void
}) => {
  const t = useT()
  const locale = useLocale()
  const missing = missingInputs(scenario, values)
  const due = nextDue(hour)

  return (
    <Sheet
      title={t.scenarios.when.another}
      meta={`${scenario.name} · ${editing ? t.scenarios.when.editTitle : t.scenarios.when.newTitle}`}
      height="88%"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={m.buttonPrimary} disabled={missing.length > 0} onClick={onSet}>
            {t.scenarios.when.save}
          </button>
          {onClear ? (
            <button type="button" className={m.buttonDanger} onClick={onClear}>
              {t.scenarios.delete}
            </button>
          ) : null}
        </>
      }
    >
      <div className={m.sheetLabel}>{t.scenarios.when.at}</div>
      {/*
        Two menus rather than a time field: the browser draws that one in its own system panel, which on
        a phone takes the whole screen and looks like somebody else's app.
      */}
      <div className={m.hourPickers}>
        <select
          className={m.input}
          value={Math.floor(hour.at / 60)}
          onChange={(event) => onHour({ ...hour, at: Number(event.target.value) * 60 + (hour.at % 60) })}
        >
          {HOURS.map((one) => (
            <option key={one} value={one}>
              {pad2(one)}
            </option>
          ))}
        </select>
        <span className={m.hourColon}>:</span>
        <select
          className={m.input}
          value={hour.at % 60}
          onChange={(event) => onHour({ ...hour, at: Math.floor(hour.at / 60) * 60 + Number(event.target.value) })}
        >
          {MINUTES.map((one) => (
            <option key={one} value={one}>
              {pad2(one)}
            </option>
          ))}
        </select>
      </div>
      <p className={m.formNote}>
        {`${t.scenarios.when.next(whenLabel(due, locale))}, ${t.scenarios.when.inTime(countdown(due - Date.now()))}`}
      </p>

      <div className={m.sheetLabel}>{t.scenarios.when.repeat}</div>
      <div className={m.chipWrap}>
        {(['once', 'daily', 'weekdays', 'weekly'] as const).map((repeat) => (
          <button
            key={repeat}
            type="button"
            className={`${m.pickChip} ${hour.repeat === repeat ? m.pickChipOn : ''}`}
            onClick={() => onHour({ ...hour, repeat })}
          >
            {t.scenarios.when.repeats[repeat]}
          </button>
        ))}
      </div>

      {hour.repeat === 'weekly' ? (
        <>
          <div className={m.sheetLabel}>{t.scenarios.when.onDay}</div>
          <div className={m.chipWrap}>
            {WEEKDAYS.map((weekday) => (
              <button
                key={weekday}
                type="button"
                className={`${m.pickChip} ${hour.weekday === weekday ? m.pickChipOn : ''}`}
                onClick={() => onHour({ ...hour, weekday })}
              >
                {weekdayName(weekday, locale)}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {scenario.inputs.length > 0 ? (
        <>
          <div className={m.sheetLabel}>{t.scenarios.when.itAsksFor}</div>
          {scenario.inputs.map((input) => (
            <div key={input.id} className={m.formRow}>
              <input
                className={m.input}
                value={values[input.name] ?? ''}
                placeholder={input.label || input.name}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => onValues({ ...values, [input.name]: event.target.value })}
              />
            </div>
          ))}
          <p className={m.formNote}>{t.scenarios.when.answeredNow}</p>
        </>
      ) : null}

      <p className={m.sheetNote}>{t.scenarios.when.needsIde}</p>
    </Sheet>
  )
}

/**
 * A sentence in, a round of work out.
 *
 * The same door the desk offers and in the same order: saying what the work is, anybody can do; filling
 * in three stages of cards to find out what the thing even is, almost nobody wants to. What comes back
 * opens in the editor unsaved.
 */
export const NewScenarioSheet = ({
  description,
  shelf,
  repositories,
  opening,
  since,
  error,
  onChange,
  onPickShelf,
  onDraft,
  onCancelDraft,
  onByHand,
  onClose,
}: {
  description: string
  /** Where it will be kept - the shared shelf, or one repository by name (see shelfOptions). */
  shelf: ShelfChoice
  repositories: RepositoryChoice[]
  /** A closed repository was picked and the IDE is opening it - said under the row while it takes. */
  opening: boolean
  /** When the model started writing, or 0 when nobody is. */
  since: number
  error: string
  onChange: (description: string) => void
  /** The row opens the pick sheet, which the screen above draws - a sheet over a sheet is its to stack. */
  onPickShelf: () => void
  onDraft: () => void
  onCancelDraft: () => void
  onByHand: () => void
  onClose: () => void
}) => {
  const t = useT()
  const drafting = since > 0
  const now = useTicking(drafting)

  return (
    <Sheet
      title={t.scenarios.draft.title}
      meta={drafting ? t.scenarios.draft.reading : t.scenarios.draft.subtitle}
      height="88%"
      onClose={drafting ? onCancelDraft : onClose}
      footer={
        drafting ? (
          <button type="button" className={m.buttonSecondary} onClick={onCancelDraft}>
            {t.common.cancel}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={m.buttonPrimary}
              disabled={description.trim().length === 0}
              onClick={onDraft}
            >
              {t.scenarios.draft.write}
            </button>
            <button type="button" className={m.buttonSecondary} onClick={onByHand}>
              {t.scenarios.draft.byHand}
            </button>
          </>
        )
      }
    >
      <textarea
        className={`${m.input} ${m.sheetArea}`}
        value={description}
        placeholder={t.scenarios.draft.hint}
        disabled={drafting}
        autoCapitalize="sentences"
        onChange={(event) => onChange(event.target.value)}
      />

      {/* The wait is answered rather than left to a spinner: this reads the project first, so it takes
          half a minute, and a screen that says nothing for half a minute reads as one that has stopped. */}
      {drafting ? (
        <div className={m.draftRow}>
          <span className={m.draftBar} />
          <span className={m.draftGoing}>{t.scenarios.draft.going}</span>
          <span className={m.draftElapsed}>{formatDuration(now - since)}</span>
        </div>
      ) : null}

      {error ? <p className={m.noteBad}>{error}</p> : null}

      <div className={m.sheetLabel}>{t.scenarios.editor.shelf}</div>
      {/* Chosen here rather than in the editor afterwards, because the model reads the repository it is
          writing for (see ScenarioAuthor): which one has to be known before it starts. A row into a
          list rather than chips: a machine remembers twenty repositories, and twenty chips are a wall. */}
      <div className={m.card}>
        <button type="button" className={m.foldRow} disabled={drafting || opening} onClick={onPickShelf}>
          <span className={m.foldName}>{t.scenarios.editor.shelf}</span>
          <span className={m.foldValue}>
            {opening ? t.mobile.newSession.opening : shelfLabel(shelf, repositories, t.scenarios.editor.mine)}
          </span>
          <span className={m.taskRowChevron}>›</span>
        </button>
      </div>
    </Sheet>
  )
}
