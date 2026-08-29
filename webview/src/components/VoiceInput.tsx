import { useEffect, useRef, useState } from 'react'
import { useLocale, useT, type Dict } from '../i18n'
import type { VoiceBalance, VoiceDevice, VoiceHotkey, VoiceHotkeySlot, VoiceLanguage } from '../protocol'
import { ChoiceList } from './Choices'
import { HotkeyCaps } from './HotkeyCaps'
import type { MenuOption } from './Menu'
import s from './sideMenu.module.css'

/** Everything the screen draws itself from - the `voiceConfig` message, plus what the panel knows. */
export interface VoiceSettings {
  enabled: boolean
  language: string
  languages: VoiceLanguage[]
  device: string
  devices: VoiceDevice[]
  /** The last four characters of the key, or empty. The key itself never comes back from the IDE. */
  keyHint: string
  hotkeys: Record<VoiceHotkeySlot, VoiceHotkey>
}

interface VoiceInputProps {
  settings: VoiceSettings
  balance: VoiceBalance
  /** Which hotkey is being recorded right now, if any - the button says so and refuses a second press. */
  capturing: VoiceHotkeySlot | null
  /** Why the last recording ended with nothing: a mouse button we will not bind, or Escape. */
  captureProblem: string
  onToggle: (enabled: boolean) => void
  onKey: (key: string) => void
  onRefreshBalance: () => void
  onCapture: (slot: VoiceHotkeySlot) => void
  onStopCapture: () => void
  onClear: (slot: VoiceHotkeySlot) => void
  onOpenLanguages: () => void
  onOpenDevices: () => void
  onOpenSite: () => void
}

/**
 * The voice input screen.
 *
 * The feature runs on a key of the person's own, which is unusual for this panel and is the honest way
 * round: transcription costs money, and the alternative would be a service of ours in the middle,
 * charging for it and hearing everything said into it. Deepgram hands out $200 at sign-up without a card,
 * which at nova-3 rates is several hundred hours of dictation - so the screen leads with that rather than
 * hiding it in a footnote: the first question anybody has here is "what will this cost me".
 */
export const VoiceInput = ({
  settings,
  balance,
  capturing,
  captureProblem,
  onToggle,
  onKey,
  onRefreshBalance,
  onCapture,
  onStopCapture,
  onClear,
  onOpenLanguages,
  onOpenDevices,
  onOpenSite,
}: VoiceInputProps) => {
  const t = useT()
  // The money is formatted by the panel's own language rather than by the account's - "$182.40" and
  // "182,40 $" are the same number, and which one reads as a number depends on who is looking.
  const locale = useLocale()
  const [key, setKey] = useState('')

  /*
   * Asked for when the screen opens rather than kept fresh in the background: it is two HTTP round trips
   * to somebody else's server, and nothing outside this screen shows it.
   *
   * Deliberately without the callback in the dependencies. It is rebuilt on every render of the panel -
   * following it would ask Deepgram about the balance several times a second - and the screen is mounted
   * exactly when it is opened, so "once, on mount" is the same thing as "once, on opening".
   */
  const ask = useRef(onRefreshBalance)
  ask.current = onRefreshBalance

  useEffect(() => {
    ask.current()
  }, [])

  const language =
    settings.languages.find((entry) => entry.code === settings.language)?.native ?? settings.language
  const device = settings.devices.find((entry) => entry.id === settings.device)?.label ?? t.voice.deviceDefault

  return (
    <div className={s.screen}>
      <span className={s.screenNote}>{t.voice.note}</span>

      <button type="button" className={s.switchRow} onClick={() => onToggle(!settings.enabled)} aria-pressed={settings.enabled}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.voice.enable}</span>
          <span className={s.switchHint}>{t.voice.enableHint}</span>
        </span>
        <span className={`${s.switchTrack} ${settings.enabled ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${settings.enabled ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      {/* The key, and what is behind it. They stand together because they answer one question - is this
          thing ready to use - and because a balance without the key it belongs to says nothing. */}
      <div className={s.field}>
        <span className={s.screenLabel}>{t.voice.key}</span>
        <div className={s.inputRow}>
          <input
            className={s.input}
            // A key is a secret being typed on a screen somebody may well be sharing.
            type="password"
            value={key}
            spellCheck={false}
            placeholder={settings.keyHint ? t.voice.keySet(settings.keyHint) : t.voice.keyPlaceholder}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || key.trim() === '') return
              onKey(key.trim())
              setKey('')
            }}
          />
          <button
            type="button"
            className={`${s.button} ${s.buttonPrimary}`}
            disabled={key.trim() === ''}
            onClick={() => {
              onKey(key.trim())
              // Cleared rather than left standing: what is in the IDE's keychain is now the truth, and a
              // field still holding the key would invite a second save of the same thing.
              setKey('')
            }}
          >
            {t.voice.keySave}
          </button>
        </div>

        <div className={s.balanceRow}>
          <span className={s.balanceText}>{balanceLine(t, balance, locale)}</span>
          <button type="button" className={s.button} onClick={onRefreshBalance}>
            {t.voice.balanceRefresh}
          </button>
        </div>

        {settings.keyHint ? (
          <button type="button" className={s.linkRow} onClick={() => onKey('')}>
            {t.voice.keyForget}
          </button>
        ) : null}
      </div>

      {/* Where the key comes from. It stands under the field rather than above it: somebody arriving with
          a key in the clipboard should meet the field first, and only the person without one reads on. */}
      <div className={s.card}>
        <span className={s.switchLabel}>{t.voice.getKey}</span>
        <span className={s.screenNote}>{t.voice.getKeyHint}</span>
        <div className={s.cardActions}>
          <button type="button" className={s.button} onClick={onOpenSite}>
            {t.voice.openSite}
          </button>
        </div>
      </div>

      <div className={s.field}>
        <span className={s.screenLabel}>{t.voice.hotkeys}</span>
        <span className={s.screenNote}>{t.voice.hotkeysHint}</span>

        <HotkeyRow
          label={t.voice.push}
          hint={t.voice.pushHint}
          keyboard={settings.hotkeys.push}
          mouse={settings.hotkeys.pushMouse}
          capturing={capturing}
          slots={{ keyboard: 'push', mouse: 'pushMouse' }}
          onCapture={onCapture}
          onStopCapture={onStopCapture}
          onClear={onClear}
        />

        <HotkeyRow
          label={t.voice.hold}
          hint={t.voice.holdHint}
          keyboard={settings.hotkeys.hold}
          mouse={settings.hotkeys.holdMouse}
          capturing={capturing}
          slots={{ keyboard: 'hold', mouse: 'holdMouse' }}
          onCapture={onCapture}
          onStopCapture={onStopCapture}
          onClear={onClear}
        />

        {captureProblem ? <span className={`${s.message} ${s.messageBad}`}>{captureProblem}</span> : null}
        <span className={s.screenNote}>{t.voice.modifierTip}</span>
      </div>

      <button type="button" className={s.switchRow} onClick={onOpenLanguages}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.voice.language}</span>
          <span className={s.switchHint}>{t.voice.languageHint}</span>
        </span>
        <span className={s.rowValue}>{language}</span>
      </button>

      <button type="button" className={s.switchRow} onClick={onOpenDevices}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.voice.device}</span>
          <span className={s.switchHint}>{t.voice.deviceHint}</span>
        </span>
        <span className={s.rowValue}>{device}</span>
      </button>
    </div>
  )
}

/**
 * One mode and both ways of triggering it.
 *
 * The keyboard and the mouse stand side by side rather than on two screens because they are the same
 * decision made twice: somebody with a side button on their mouse wants it *as well as* the chord, not
 * instead of it (see HotkeyEngine - they are independent triggers).
 */
const HotkeyRow = ({
  label,
  hint,
  keyboard,
  mouse,
  capturing,
  slots,
  onCapture,
  onStopCapture,
  onClear,
}: {
  label: string
  hint: string
  keyboard: VoiceHotkey
  mouse: VoiceHotkey
  capturing: VoiceHotkeySlot | null
  slots: { keyboard: VoiceHotkeySlot; mouse: VoiceHotkeySlot }
  onCapture: (slot: VoiceHotkeySlot) => void
  onStopCapture: () => void
  onClear: (slot: VoiceHotkeySlot) => void
}) => {
  const t = useT()

  return (
    <div className={s.hotkeyBlock}>
      <span className={s.switchLabel}>{label}</span>
      <span className={s.switchHint}>{hint}</span>

      <div className={s.hotkeyRow}>
        <HotkeyButton
          kind={t.voice.keyboard}
          binding={keyboard}
          slot={slots.keyboard}
          capturing={capturing}
          onCapture={onCapture}
          onStopCapture={onStopCapture}
          onClear={onClear}
        />
        <HotkeyButton
          kind={t.voice.mouse}
          binding={mouse}
          slot={slots.mouse}
          capturing={capturing}
          onCapture={onCapture}
          onStopCapture={onStopCapture}
          onClear={onClear}
        />
      </div>
    </div>
  )
}

const HotkeyButton = ({
  kind,
  binding,
  slot,
  capturing,
  onCapture,
  onStopCapture,
  onClear,
}: {
  kind: string
  binding: VoiceHotkey
  slot: VoiceHotkeySlot
  capturing: VoiceHotkeySlot | null
  onCapture: (slot: VoiceHotkeySlot) => void
  onStopCapture: () => void
  onClear: (slot: VoiceHotkeySlot) => void
}) => {
  const t = useT()
  const recording = capturing === slot
  const bound = binding.caps.length > 0

  // Each half of the row takes one device and refuses the other (see VoiceHotkeys.Device), so the wait
  // has to say which one it is waiting for - "press a key" over a slot that ignores keys is a slot that
  // looks broken.
  const mouseSlot = slot === 'pushMouse' || slot === 'holdMouse'

  // Bound, the keys are the button: they are what somebody looks for, and a frame around a frame is one
  // border too many. Empty, there is nothing to look at, so the button has to look like one - see the CSS.
  const look = recording ? s.hotkeyButtonLive : bound ? s.hotkeyButtonSet : s.hotkeyButtonEmpty

  return (
    <div className={s.hotkeySlot}>
      <span className={s.hotkeyKind}>{kind}</span>
      <button
        type="button"
        className={`${s.hotkeyButton} ${look}`}
        onClick={() => (recording ? onStopCapture() : onCapture(slot))}
      >
        {recording
          ? mouseSlot
            ? t.voice.recordingMouse
            : t.voice.recording
          : bound
            ? <HotkeyCaps caps={binding.caps} />
            : t.voice.notSet}
      </button>
      {bound && !recording ? (
        <button type="button" className={s.hotkeyClear} aria-label={t.voice.clear} onClick={() => onClear(slot)}>
          ×
        </button>
      ) : null}
    </div>
  )
}

/**
 * Which language dictation listens in.
 *
 * Deepgram's own catalogue, each language written in itself with the English name underneath - the same
 * rule as the panel's own language screen, and for the same reason: somebody scanning for their language
 * is scanning for how they write it.
 */
export const VoiceLanguages = ({
  settings,
  onPick,
}: {
  settings: VoiceSettings
  onPick: (code: string) => void
}) => {
  const t = useT()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const options: MenuOption[] = settings.languages
    .filter(
      (entry) =>
        needle === '' ||
        entry.native.toLowerCase().includes(needle) ||
        entry.english.toLowerCase().includes(needle) ||
        entry.code.toLowerCase().includes(needle),
    )
    .map((entry) => ({ id: entry.code, label: entry.native, sub: entry.english }))

  return (
    <div className={s.screen}>
      <input
        className={s.input}
        value={query}
        spellCheck={false}
        placeholder={t.voice.searchLanguages}
        onChange={(event) => setQuery(event.target.value)}
      />
      <span className={s.screenNote}>{t.voice.multiHint}</span>
      <ChoiceList options={options} selected={settings.language} onPick={onPick} />
    </div>
  )
}

/** Which microphone to listen through. The first entry is whatever the system calls the default. */
export const VoiceDevices = ({
  settings,
  onPick,
}: {
  settings: VoiceSettings
  onPick: (id: string) => void
}) => {
  const t = useT()

  const options: MenuOption[] = [
    { id: SYSTEM_DEVICE, label: t.voice.deviceDefault, sub: t.voice.deviceDefaultHint },
    ...settings.devices.map((device) => ({ id: device.id, label: device.label })),
  ]

  return (
    <ChoiceList
      options={options}
      selected={settings.device || SYSTEM_DEVICE}
      note={t.voice.deviceNote}
      onPick={(id) => onPick(id === SYSTEM_DEVICE ? '' : id)}
    />
  )
}

/** The "whatever the system says" entry. Empty is what the setting stores; a list needs a key. */
const SYSTEM_DEVICE = 'system'

/**
 * What is left on the account, in one line.
 *
 * `noAccess` is deliberately not phrased as a failure: reading a balance needs the owner or admin role at
 * Deepgram, so a key made as a member transcribes perfectly and cannot see the money. Saying "something
 * went wrong" there would send people replacing a key that works.
 */
const balanceLine = (t: Dict, balance: VoiceBalance, locale: string): string => {
  switch (balance.state) {
    case 'ok':
      return t.voice.balanceLeft(money(balance.amount, balance.units, locale))
    case 'checking':
      return t.voice.balanceChecking
    case 'none':
      return t.voice.balanceNoKey
    case 'noAccess':
      return t.voice.balanceNoAccess
    case 'rejected':
      return t.voice.balanceRejected
    case 'failed':
      return t.voice.balanceFailed
  }
}

const money = (amount: number, units: string, locale: string): string => {
  if (units !== 'usd') return `${amount.toFixed(2)} ${units}`

  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount)
}
