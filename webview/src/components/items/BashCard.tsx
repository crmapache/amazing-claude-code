import type { BashItem } from '../../feed/types'
import s from '../feed.module.css'

/**
 * A command the person ran themselves through "!", and its output.
 *
 * A card of its own rather than the same one a tool call gets: that one was called by the agent and it
 * answers for it, while this command was typed by hand - and there was nobody to ask permission from.
 * Hence the "!" at the start, the same one it was typed with.
 */
export const BashCard = ({ item }: { item: BashItem }) => {
  const failed = !item.pending && item.exitCode !== undefined && item.exitCode !== 0

  return (
    <div className={s.bash}>
      <div className={s.bashHead}>
        <span className={`${s.toolChip} ${s.chipBash} ${item.pending ? s.thinkPending : ''}`}>!</span>
        <span className={s.bashCommand}>{item.command}</span>
        <div className={s.spacer} />
        {item.pending ? (
          // Together with toolMeta: the pulsing "running right now" caption is set by a compound rule
          // (.toolMeta.running), and on its own the running class means nothing - the same pair as with
          // tool calls.
          <span className={`${s.toolMeta} ${s.running}`}>running</span>
        ) : failed ? (
          <span className={s.bashFailed}>exit {item.exitCode}</span>
        ) : null}
      </div>

      {/* Empty output is not hidden behind an ellipsis but named in words: "the command ran and said
          nothing" and "the output went missing" are different things. */}
      {item.pending ? null : (
        <pre className={`${s.bashOutput} ${failed ? s.bashOutputFailed : ''}`}>
          {item.output.trimEnd() || 'no output'}
        </pre>
      )}
    </div>
  )
}
