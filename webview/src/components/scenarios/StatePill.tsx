import type { ScenarioRunState, ScenarioStepState } from '../../protocol'
import { useT } from '../../i18n'
import s from './statePill.module.css'

/**
 * What a run, or one step of it, is doing right now - in one word and one colour.
 *
 * One component for both because they are read the same way and must not disagree: a step drawn as
 * running under a run drawn as paused is a screen nobody can believe. The words are chosen at drawing
 * time rather than carried in the record, so a run opened in the morning speaks whatever language the
 * panel is set to now (see the rule about the reducer in the i18n notes).
 */
export const StatePill = (
  props:
    | { state: ScenarioRunState; failure: string; step?: never }
    | { step: ScenarioStepState; failure: string; state?: never },
) => {
  const t = useT()

  const kind = props.step ?? props.state
  const words = props.step ? t.scenarios.stepStates : t.scenarios.runStates
  const tone =
    kind === 'done'
      ? s.pillDone
      : kind === 'failed'
        ? s.pillFailed
        : kind === 'blocked' || kind === 'asking'
          ? s.pillWaiting
          : kind === 'paused' || kind === 'waiting' || kind === 'skipped'
            ? s.pillPaused
            : kind === 'stopped'
              ? s.pillPaused
              : s.pillRunning

  // A failure that has a name of its own says it instead of the plain word: "cut short" and "ran past its
  // time" are the two anybody wants to tell apart, and both are the state "failed".
  const word =
    kind === 'failed' && props.failure && props.failure in t.scenarios.failures
      ? t.scenarios.failures[props.failure as keyof typeof t.scenarios.failures]
      : words[kind as keyof typeof words]

  /*
   * The state and nothing else.
   *
   * How many times a card was sent back to work is worth knowing and is written under it, in words, in
   * the line that says what came of it - inside the pill it turned a state into a sentence and left the
   * one thing the pill is for competing for its own room.
   */
  return (
    <span className={`${s.pill} ${tone}`}>
      <span className={s.pillDot} />
      {word}
    </span>
  )
}
