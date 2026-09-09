import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioSchedule } from '../protocol'
import { blankScenario } from './blank'
import { countdown, dayKey, daysBetween, timetableOf } from './timetable'

const scenario = (id: string): Scenario => ({ ...blankScenario('A round', 'Stage', 'user'), id })

const hour = (over: Partial<ScenarioSchedule>): ScenarioSchedule => ({
  id: 'h1',
  scenarioId: 'one',
  scope: 'user',
  at: 9 * 60,
  repeat: 'daily',
  weekday: 1,
  inputs: {},
  nextAt: 0,
  lastAt: 0,
  missedAt: 0,
  ...over,
})

/** A fixed evening to reason from, so a test never falls over a real midnight. */
const NOW = new Date(2026, 8, 8, 18, 0, 0).getTime()
const at = (day: number, hours: number, minutes = 0): number =>
  new Date(2026, 8, day, hours, minutes, 0).getTime()

describe('the timetable', () => {
  it('groups the coming hours by the day they fall on', () => {
    const table = timetableOf(
      [
        hour({ id: 'a', scenarioId: 'one', nextAt: at(8, 23, 22) }),
        hour({ id: 'b', scenarioId: 'one', nextAt: at(9, 9) }),
        hour({ id: 'c', scenarioId: 'one', nextAt: at(8, 21) }),
      ],
      [scenario('one')],
      NOW,
    )

    expect(table.days.map((day) => day.rows.length)).toEqual([2, 1])
    expect(table.days[0].awayInDays).toBe(0)
    expect(table.days[1].awayInDays).toBe(1)
    expect(table.count).toBe(3)
  })

  it('puts the soonest hour of a day first', () => {
    const table = timetableOf(
      [
        hour({ id: 'late', nextAt: at(8, 23) }),
        hour({ id: 'soon', nextAt: at(8, 20) }),
      ],
      [scenario('one')],
      NOW,
    )

    expect(table.days[0].rows.map((row) => row.schedule.id)).toEqual(['soon', 'late'])
  })

  it('gives a one-off that nobody was here for a band of its own', () => {
    const table = timetableOf(
      [hour({ id: 'gone', repeat: 'once', nextAt: 0, missedAt: at(8, 3) })],
      [scenario('one')],
      NOW,
    )

    expect(table.missed.map((row) => row.schedule.id)).toEqual(['gone'])
    expect(table.missed[0].missed).toBe(true)
    expect(table.days).toEqual([])
    expect(table.count).toBe(1)
  })

  /*
   * A daily hour that was missed still has tonight's, and the timetable is a list of what is going to
   * happen: drawn twice it would carry two rows with one Change button between them, both of which
   * delete the same arrangement.
   */
  it('leaves a repeating hour that was missed on its coming day, once', () => {
    const table = timetableOf(
      [hour({ id: 'nightly', nextAt: at(9, 3), missedAt: at(8, 3) })],
      [scenario('one')],
      NOW,
    )

    expect(table.missed).toEqual([])
    expect(table.days).toHaveLength(1)
    expect(table.days[0].rows[0].missed).toBe(false)
  })

  it('drops an arrangement with nothing coming and no night behind it', () => {
    const table = timetableOf([hour({ nextAt: 0, missedAt: 0 })], [scenario('one')], NOW)

    expect(table.count).toBe(0)
  })

  it('names the scenario an hour belongs to, and admits when there is none', () => {
    const table = timetableOf(
      [
        hour({ id: 'known', scenarioId: 'one', nextAt: at(9, 9) }),
        hour({ id: 'orphan', scenarioId: 'gone', nextAt: at(9, 10) }),
      ],
      [scenario('one')],
      NOW,
    )

    const rows = table.days[0].rows
    expect(rows[0].scenario?.id).toBe('one')
    expect(rows[1].scenario).toBeNull()
  })

  /* Two scenarios may carry the same identifier on two shelves - the shelf is half the name. */
  it('tells one shelf from the other when the identifiers match', () => {
    const mine = { ...scenario('one'), scope: 'user' as const, name: 'Mine' }
    const shared = { ...scenario('one'), scope: 'project' as const, name: 'Shared' }

    const table = timetableOf(
      [hour({ scenarioId: 'one', scope: 'project', nextAt: at(9, 9) })],
      [mine, shared],
      NOW,
    )

    expect(table.days[0].rows[0].scenario?.name).toBe('Shared')
  })
})

describe('the day an hour lands on', () => {
  it('is the machine’s own calendar day, not a UTC one', () => {
    expect(dayKey(at(8, 23, 30))).toBe('2026-09-08')
    expect(dayKey(at(9, 0, 30))).toBe('2026-09-09')
  })

  it('counts calendar days rather than stretches of twenty-four hours', () => {
    expect(daysBetween(at(8, 23, 30), at(9, 0, 30))).toBe(1)
    expect(daysBetween(at(8, 1), at(8, 23))).toBe(0)
  })
})

describe('how far off an hour is', () => {
  it('reads in the largest unit it has', () => {
    expect(countdown(14 * 60_000)).toBe('14m')
    expect(countdown(6 * 3_600_000 + 14 * 60_000)).toBe('6h')
    expect(countdown(50 * 3_600_000)).toBe('2d')
  })

  it('says now rather than a number below a minute', () => {
    expect(countdown(0)).toBe('now')
    expect(countdown(-5000)).toBe('now')
    expect(countdown(30_000)).toBe('now')
  })
})
