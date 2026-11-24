import { Fragment } from 'react'
import { HotkeyCaps, type KeyCap } from './HotkeyCaps'
import { useT } from '../i18n'
import { onMac, type SendKey } from '../sendKey'
import { pageCaps, type PanelKeys } from '../panelKeys'
import { searchKeys } from './Search'
import type { PanelKeyName, PanelKeyStroke, VoiceHotkeyCap } from '../protocol'
import s from './sideMenu.module.css'

type Cap = KeyCap | VoiceHotkeyCap

/**
 * One line of the cheat sheet: what it does, when it works if that needs saying, and the key.
 *
 * `chords` are alternatives ("↑" or "↓", "1" to "9" is one cap), each of them the keys pressed together.
 * `strokes` is the other shape - one shortcut of the IDE's, which may take two keystrokes in a row. A row
 * from the IDE with no key at all says so in words: it is unbound in Keymap, and that is worth knowing.
 */
interface KeyRow {
  label: string
  when?: string
  chords?: Cap[][]
  strokes?: PanelKeyStroke[]
}

interface KeysScreenProps {
  /** The IDE's own keys, as its Keymap binds them now - see PanelKeys.kt. */
  keys: PanelKeys
  sendKey: SendKey
  /** The dictation hotkeys, when the voice settings have any bound on the keyboard. */
  voice: { push: VoiceHotkeyCap[]; hold: VoiceHotkeyCap[] } | null
  /** Settings | Keymap, filtered to the plugin's actions. */
  onOpenKeymap: () => void
}

/**
 * Every key the panel answers to, on one screen.
 *
 * It exists because the keys were there and nobody could find them: a report asked for keyboard support
 * in a panel that already stopped the agent on Escape, switched modes on Shift+Tab, searched on Cmd+F and
 * answered questions by digit. A key nobody knows about is a mouse click by another name.
 *
 * Two kinds of key stand here, and the screen does not hide the difference. The tab keys and Queue are
 * the IDE's actions (see PanelKeys.kt): they are drawn as the IDE says they are bound right now, and the
 * button at the foot changes them in Keymap. The rest the page listens for itself - fixed, the way a
 * terminal's are, and drawn from the same rules the field uses (see sendKey.ts).
 */
export const KeysScreen = ({ keys, sendKey, voice, onOpenKeymap }: KeysScreenProps) => {
  const t = useT()
  const w = t.keys
  const { chord, key } = pageCaps
  const enter = key('Enter')
  const ide = (name: PanelKeyName): PanelKeyStroke[] => keys[name] ?? []

  const groups: { title: string; rows: KeyRow[] }[] = [
    {
      title: w.groups.tabs,
      rows: [
        { label: w.rows.nextTab, when: w.rows.searchTabsWhen, strokes: ide('nextTab') },
        { label: w.rows.previousTab, when: w.rows.searchTabsWhen, strokes: ide('previousTab') },
        { label: w.rows.newTab, strokes: ide('newTab') },
        { label: w.rows.closeTab, when: w.rows.closeTabWhen, strokes: ide('closeTab') },
        { label: w.rows.reopenTab, when: w.rows.reopenTabWhen, strokes: ide('reopenTab') },
        { label: w.rows.openPanel, when: w.rows.openPanelWhen, strokes: ide('openPanel') },
      ],
    },
    {
      title: w.groups.message,
      rows: [
        { label: w.rows.send, chords: [sendKey === 'modEnter' ? chord(['mod'], enter) : [enter]] },
        { label: w.rows.newLine, chords: [sendKey === 'modEnter' ? [enter] : chord(['shift'], enter)] },
        { label: w.rows.queue, when: w.rows.queueWhen, strokes: ide('queue') },
        {
          label: w.rows.history,
          when: w.rows.historyWhen,
          chords: [[pageCaps.arrow('up')], [pageCaps.arrow('down')]],
        },
        { label: w.rows.commands, chords: [[key('/')]] },
        { label: w.rows.files, chords: [[key('@')]] },
        { label: w.rows.shell, when: w.rows.shellWhen, chords: [[key('!')]] },
        // A Mac prints "delete" on the key the other keyboards call Backspace.
        { label: w.rows.deleteWord, chords: [chord(['mod'], key(onMac() ? 'Delete' : 'Backspace'))] },
        { label: w.rows.undo, chords: [chord(['mod'], key('Z'))] },
        { label: w.rows.redo, chords: [chord(['mod', 'shift'], key('Z'))] },
      ],
    },
    {
      title: w.groups.agent,
      rows: [
        { label: w.rows.stop, when: w.rows.stopWhen, chords: [[key('Esc')]] },
        { label: w.rows.mode, chords: [chord(['shift'], key('Tab'))] },
        { label: w.rows.answer, when: w.rows.answerWhen, chords: [[key('1-9')]] },
      ],
    },
    {
      title: w.groups.panel,
      rows: [
        { label: w.rows.search, chords: [chord(['mod'], key('F'))] },
        { label: w.rows.terminal, when: w.rows.terminalWhen, strokes: ide('terminal') },
        { label: w.rows.fork, when: w.rows.forkWhen, chords: [chord(['alt'], key('B'))] },
        // The dictation keys only when bound: unbound they are a setting of the voice screen, not a key.
        ...(voice && voice.push.length > 0 ? [{ label: t.voice.push, chords: [voice.push] }] : []),
        ...(voice && voice.hold.length > 0 ? [{ label: t.voice.hold, chords: [voice.hold] }] : []),
      ],
    },
    {
      // The search window's own keys, named by what stands on its tabs and switches (see searchKeys).
      title: t.search.title,
      rows: [
        { label: t.search.tabs.chat, chords: [searchKeys.tab('chat')] },
        { label: t.search.tabs.project, chords: [searchKeys.tab('project')] },
        { label: t.search.tabs.ai, chords: [searchKeys.tab('ai')] },
        { label: t.search.matchCase, chords: [searchKeys.matchCase()] },
        { label: t.search.wholeWords, chords: [searchKeys.wholeWords()] },
      ],
    },
  ]

  return (
    <div className={s.screen}>
      <span className={s.screenNote}>{w.note}</span>

      {groups.map((group) => (
        <div key={group.title} className={s.keysGroup}>
          <span className={s.keysGroupTitle}>{group.title}</span>
          {group.rows.map((row) => (
            <div key={row.label} className={s.keysRow}>
              <span className={s.keysText}>
                <span className={s.keysLabel}>{row.label}</span>
                {row.when ? <span className={s.keysWhen}>{row.when}</span> : null}
              </span>
              <span className={s.keysCaps}>
                <Keys row={row} unset={w.notSet} />
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className={s.keysFoot}>
        <span className={s.screenNote}>{w.keymapNote}</span>
        <button type="button" className={s.button} onClick={onOpenKeymap}>
          {w.openKeymap}
        </button>
      </div>
    </div>
  )
}

/** The keys of one row: alternatives apart, two strokes of one shortcut apart, or "Not set". */
const Keys = ({ row, unset }: { row: KeyRow; unset: string }) => {
  if (row.strokes) {
    if (row.strokes.length === 0) return <span className={s.keysUnset}>{unset}</span>

    return (
      <>
        {row.strokes.map((stroke, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className={s.keysBetween}>,</span> : null}
            <HotkeyCaps caps={stroke} />
          </Fragment>
        ))}
      </>
    )
  }

  return (
    <>
      {(row.chords ?? []).map((chord, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className={s.keysBetween}>/</span> : null}
          <HotkeyCaps caps={chord} />
        </Fragment>
      ))}
    </>
  )
}
