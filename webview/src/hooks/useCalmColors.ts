import { useEffect } from 'react'

/**
 * The attribute the no-stress colour mode hangs on, and the one place the panel and the phone agree
 * about its name. The rules that answer it live in tokens.css - see [data-acc-calm] there.
 *
 * On the root element rather than on a wrapper of the panel: what it swaps are custom properties, and
 * they have to be inherited by every gauge on the page - the composer's bar, the rings in the status
 * row, the sheet of limits on the phone, and whatever is drawn over them in a floating layer.
 */
const CALM_ATTRIBUTE = 'data-acc-calm'

/**
 * The no-stress colour mode, applied.
 *
 * Everything else about the mode is a swap of four CSS roles (see tokens.css), so there is nothing to
 * thread through the components: a gauge painted through the ladder is calmed without knowing that the
 * setting exists. This is the whole of the wiring - the state that says whether it is on lives where
 * every other machine-wide preference does (ClaudePreferences.calmColors).
 */
export const useCalmColors = (on: boolean): void => {
  useEffect(() => {
    document.documentElement.toggleAttribute(CALM_ATTRIBUTE, on)
  }, [on])
}
