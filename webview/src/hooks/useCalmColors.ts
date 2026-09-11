import { useEffect } from 'react'
import { CALM_VIVID_FULL, clampVivid } from '../calmColors'

/**
 * The attribute the no-stress colour mode hangs on, and the one place the panel and the phone agree
 * about its name. The rules that answer it live in tokens.css - see [data-acc-calm] there.
 *
 * On the root element rather than on a wrapper of the panel: what it swaps are custom properties, and
 * they have to be inherited by every gauge on the page - the composer's bar, the rings in the status
 * row, the sheet of limits on the phone, and whatever is drawn over them in a floating layer.
 */
const CALM_ATTRIBUTE = 'data-acc-calm'

/** How much of the paint survives, as the rules over there read it. */
const VIVID_PROPERTY = '--acc-gauge-vivid'

/**
 * The no-stress colour mode, applied.
 *
 * Everything else about the mode is a swap of four CSS roles (see tokens.css), so there is nothing to
 * thread through the components: a gauge painted through the ladder is calmed without knowing that the
 * setting exists. This is the whole of the wiring - the figure itself lives where every other
 * machine-wide preference does (ClaudePreferences.gaugeVivid).
 */
export const useCalmColors = (vivid: number): void => {
  useEffect(() => {
    const root = document.documentElement
    const figure = clampVivid(vivid)

    // At the full hundred nothing is swapped at all, and the gauges wear the literals of :root rather
    // than a mix that has nothing left to mix. There is no visible difference either way - the point is
    // that a panel nobody has calmed cannot be made to differ from the one before the setting existed.
    if (figure >= CALM_VIVID_FULL) {
      root.removeAttribute(CALM_ATTRIBUTE)
      root.style.removeProperty(VIVID_PROPERTY)
      return
    }

    // The figure before the attribute, and taken away after it: a frame in which the rules already
    // answer and the number has not arrived is a frame with no paint on the gauges (the fallback in
    // tokens.css covers it, but the order is free).
    root.style.setProperty(VIVID_PROPERTY, `${figure}%`)
    root.toggleAttribute(CALM_ATTRIBUTE, true)
  }, [vivid])
}
