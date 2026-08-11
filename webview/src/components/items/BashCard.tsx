import type { BashItem } from '../../feed/types'
import s from '../feed.module.css'

/**
 * Команда, которую человек выполнил сам через «!», и её вывод.
 *
 * Отдельная карточка, а не такая же, как у вызова инструмента: тот вызвал агент
 * и за него отвечает он, а эту команду набрали руками — и спрашивать разрешения
 * на неё было не у кого. Отсюда и знак «!» в начале, тот же, которым её набрали.
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
          // Вместе с toolMeta: пульсирующая подпись «идёт прямо сейчас» задана
          // составным правилом (.toolMeta.running), и в одиночку класс running
          // не значит ничего — та же пара, что у вызовов инструментов.
          <span className={`${s.toolMeta} ${s.running}`}>running</span>
        ) : failed ? (
          <span className={s.bashFailed}>exit {item.exitCode}</span>
        ) : null}
      </div>

      {/* Пустой вывод не прячем за многоточием, а называем словами: «команда
          отработала и промолчала» и «вывод куда-то делся» — разные вещи. */}
      {item.pending ? null : (
        <pre className={`${s.bashOutput} ${failed ? s.bashOutputFailed : ''}`}>
          {item.output.trimEnd() || 'no output'}
        </pre>
      )}
    </div>
  )
}
