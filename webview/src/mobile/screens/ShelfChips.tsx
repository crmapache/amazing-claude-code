import { useT } from '../../i18n'
import type { RepositoryChoice, ShelfChoice } from '../scenarios'
import m from '../mobile.module.css'

/**
 * Where a scenario is kept, as a row of chips: the shelf every project shares, then each repository by
 * name.
 *
 * Two places ask this - the sheet that writes a new scenario and the editor's own row - and they used to
 * answer it with a two-way switch, "this repository" against "every project". From a phone "this
 * repository" named nothing: the screen is opened from a menu, and which project it was opened over is
 * a line in a header somebody has scrolled past. So the repositories are named, and the shared shelf
 * stands first because it is the one a phone most often wants.
 *
 * A repository that cannot take a scenario is still shown, greyed: closed in the IDE, or a project with
 * no folder to write into (see ScenarioShelves.canShare). Left out, it would read as a project this
 * phone has never heard of.
 */
export const ShelfChips = ({
  shelf,
  repositories,
  disabled = false,
  onPick,
}: {
  shelf: ShelfChoice
  repositories: RepositoryChoice[]
  disabled?: boolean
  onPick: (shelf: ShelfChoice) => void
}) => {
  const t = useT()

  return (
    <div className={m.chipWrap}>
      <button
        type="button"
        className={`${m.pickChip} ${shelf.scope === 'user' ? m.pickChipOn : ''}`}
        disabled={disabled}
        onClick={() => onPick({ scope: 'user' })}
      >
        {t.scenarios.editor.mine}
      </button>

      {repositories.map((one) => {
        const on = shelf.scope === 'project' && shelf.agentId === one.agentId && shelf.projectKey === one.projectKey

        return (
          <button
            key={`${one.agentId}:${one.projectKey}`}
            type="button"
            className={`${m.pickChip} ${on ? m.pickChipOn : ''}`}
            disabled={disabled || one.closed || !one.canShare}
            title={one.closed ? t.mobile.sessions.projectClosed : !one.canShare ? t.scenarios.shelves.noProject : undefined}
            onClick={() => onPick({ scope: 'project', agentId: one.agentId, projectKey: one.projectKey })}
          >
            {one.name}
          </button>
        )
      })}
    </div>
  )
}
