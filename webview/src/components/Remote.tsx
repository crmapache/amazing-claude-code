import { useEffect, useState } from 'react'
import { describeWhen } from '../feed/when'
import type { RemoteDevice } from '../protocol'
import { QrCode } from './QrCode'
import s from './sideMenu.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import { useFieldHistory } from '../hooks/useFieldHistory'

export interface RemoteStatus {
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'relay_down' | 'refused'
  enabled: boolean
  relay: string
  agentId: string
  fingerprint?: string
  keysKept?: boolean
  devices?: RemoteDevice[]
  pairing?: { url: string; expiresAt: number }
  pending?: { deviceId: string; label: string; fingerprint: string }
}

interface RemoteProps {
  status: RemoteStatus
  onToggle: (enabled: boolean) => void
  onRelay: (url: string) => void
  onPair: () => void
  onCancelPairing: () => void
  onApprove: () => void
  onRefuse: () => void
  onRevoke: (deviceId: string) => void
  /** The way into "what travels" - the reading that belongs beside the switch rather than on top of it. */
  onAbout: () => void
}

/** How long a pairing code is still worth something, in words rather than a timestamp. */
const remaining = (t: Dict, expiresAt: number): string => {
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
  return seconds > 60 ? t.remote.minutesLeft(Math.ceil(seconds / 60)) : t.remote.secondsLeft(seconds)
}

/**
 * What each state means in words a person can act on, and which colour says it before the words are read.
 *
 * Kept apart rather than collapsed into one spinner because the fix differs: a tunnel fixes itself, a
 * relay that is down is somebody else's server, and a refusal will still be a refusal in an hour.
 */
type RemoteTone = 'off' | 'busy' | 'live' | 'bad'

/**
 * The colour of each state. The words live in the dictionary beside it (see remote.states) - the colour
 * says the same thing before the words are read, and that half is the same in every language.
 */
const REMOTE_TONE: Record<RemoteStatus['state'], RemoteTone> = {
  idle: 'off',
  connecting: 'busy',
  connected: 'live',
  reconnecting: 'busy',
  relay_down: 'bad',
  refused: 'bad',
}

/** The state's own words - the key the dictionary knows it by. */
const STATE_WORDS: Record<RemoteStatus['state'], keyof Dict['remote']['states']> = {
  idle: 'idle',
  connecting: 'connecting',
  connected: 'connected',
  reconnecting: 'reconnecting',
  relay_down: 'unreachable',
  refused: 'refused',
}

/** What a state says and how it is coloured, in one answer - the menu's row asks for exactly this. */
export const remoteState = (
  t: Dict,
  state: RemoteStatus['state'],
): { label: string; hint: string; tone: RemoteTone } => ({
  ...t.remote.states[STATE_WORDS[state]],
  tone: REMOTE_TONE[state],
})

const TONE_COLOR: Record<'off' | 'busy' | 'live' | 'bad', string> = {
  off: 'var(--acc-fg-ghost)',
  busy: 'var(--acc-warn)',
  live: 'var(--acc-ok)',
  bad: 'var(--acc-bad)',
}

const TONE_TINT: Record<'off' | 'busy' | 'live' | 'bad', { border: string; background: string }> = {
  off: { border: 'var(--acc-line)', background: 'var(--acc-bg-card)' },
  busy: { border: 'var(--acc-warn-32)', background: 'var(--acc-warn-06)' },
  live: { border: 'var(--acc-ok-32)', background: 'var(--acc-ok-10)' },
  bad: { border: 'var(--acc-bad-32)', background: 'var(--acc-bad-10)' },
}

/**
 * Turning remote access on, and pointing it somewhere.
 *
 * Four separate things rather than one wall of prose: what the state is right now, whether it may be
 * reached at all, which relay it goes through, and who is already paired. The reading - what travels and
 * what a phone may do - has a screen of its own behind a row at the bottom: it has to be available before
 * the switch, but a person who has already read it should not have to scroll past it every time.
 */
export const Remote = ({
  status,
  onToggle,
  onRelay,
  onPair,
  onCancelPairing,
  onApprove,
  onRefuse,
  onRevoke,
  onAbout,
}: RemoteProps) => {
  const t = useT()
  const [relay, setRelay] = useState(status.relay)

  /** Only so the countdown under the code moves - there is nothing else on this screen that ticks. */
  const [, tick] = useState(0)

  // The address may change under us - another panel in another window has the same screen.
  useEffect(() => setRelay(status.relay), [status.relay])

  useEffect(() => {
    if (!status.pairing) return

    const timer = window.setInterval(() => tick((count) => count + 1), 1000)
    return () => window.clearInterval(timer)
  }, [status.pairing])

  const meaning = remoteState(t, status.state)
  const colour = TONE_COLOR[meaning.tone]
  const tint = TONE_TINT[meaning.tone]
  const devices = status.devices ?? []

  const relayKeys = useFieldHistory(relay, setRelay)

  return (
    <div className={s.screen}>
      <div className={s.stateCard} style={{ borderColor: tint.border, background: tint.background }}>
        <div className={s.stateTop} style={{ color: colour }}>
          <span className={s.stateDot} />
          <span className={s.stateLabel}>{meaning.label}</span>
          <span className={s.stateAgent}>{t.remote.agent(status.agentId || '—')}</span>
        </div>
        <p className={s.stateHint}>{meaning.hint}</p>

        {/* The relay is the part people ask about, so the path is drawn rather than described: one hop
            that forwards, not a service the conversation is handed over to. */}
        <div className={s.path}>
          <span className={s.pathNode}>{t.remote.thisIde}</span>
          <span className={s.pathLink} />
          <span
            className={`${s.pathNode} ${status.state === 'connected' ? s.pathNodeLive : ''}`}
            style={status.state === 'connected' ? { color: colour } : undefined}
          >
            {t.remote.relay}
          </span>
          <span className={s.pathLink} />
          <span className={s.pathNode}>{t.remote.device}</span>
        </div>
      </div>

      <button type="button" className={s.switchRow} onClick={() => onToggle(!status.enabled)} aria-pressed={status.enabled}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.remote.allow}</span>
          <span className={s.switchHint}>{t.remote.allowHint}</span>
        </span>
        <span className={`${s.switchTrack} ${status.enabled ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${status.enabled ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      <div className={s.field}>
        <span className={s.screenLabel}>{t.remote.relayAddress}</span>
        <input
          className={s.input}
          value={relay}
          spellCheck={false}
          placeholder="wss://…"
          onChange={relayKeys.onChange}
          onBlur={() => relay !== status.relay && onRelay(relay)}
          onKeyDown={(event) => {
            relayKeys.onKeyDown(event)
            if (!event.defaultPrevented && event.key === 'Enter') onRelay(relay)
          }}
        />
        <span className={s.screenNote}>
          Empty means the public one. It must be wss:// - a relay over plain http would leave the browser
          without the cryptography this relies on, so it is refused rather than quietly weakened.
        </span>
      </div>

      {status.keysKept === false && (
        <div className={s.screenNote}>{t.remote.noSafe}</div>
      )}

      {/* A device that has proved it saw the code and is waiting for a person. The proof is not the whole
          story: what it cannot catch is someone who photographed the screen, or saw it in a recording, and
          scanned it first. Comparing the two fingerprints does catch that. */}
      {status.pending && (
        <div className={s.card}>
          <span className={s.switchLabel}>{t.remote.wantsToPair(status.pending.label)}</span>
          <span className={s.screenNote}>{t.remote.checkFingerprint}</span>
          <code className={s.fingerprint}>{status.pending.fingerprint}</code>
          <div className={s.cardActions}>
            <button type="button" className={`${s.button} ${s.buttonPrimary}`} onClick={onApprove}>
              {t.remote.allowDevice}
            </button>
            <button type="button" className={s.button} onClick={onRefuse}>
              {t.remote.refuse}
            </button>
          </div>
        </div>
      )}

      {status.pairing && !status.pending && (
        <div className={s.card}>
          <span className={s.switchLabel}>{t.remote.scanThis}</span>
          <span className={s.screenNote}>{t.remote.codeNote(remaining(t, status.pairing.expiresAt))}</span>
          <div className={s.qr}>
            <div className={s.qrCode}>
              <QrCode value={status.pairing.url} />
            </div>
            <div className={s.qrSide}>
              <code className={s.qrUrl}>{status.pairing.url}</code>
              <button type="button" className={`${s.button} ${s.buttonWide}`} onClick={onCancelPairing}>
                {t.remote.stopOffering}
              </button>
            </div>
          </div>
        </div>
      )}

      {status.enabled && !status.pairing && !status.pending && (
        <button type="button" className={`${s.button} ${s.buttonPrimary} ${s.buttonWide}`} onClick={onPair}>
          {t.remote.pairDevice}
        </button>
      )}

      {devices.length > 0 && (
        <div className={s.field}>
          <span className={s.screenLabel}>{t.remote.pairedDevices}</span>
          {devices.map((device) => (
            <div key={device.id} className={s.device}>
              <span className={s.deviceText}>
                <span className={s.deviceLabel}>{device.label}</span>
                {/* When it was last heard from, because revoking is by hand and stays that way: the key
                    a phone keeps has no expiry, so the only thing that makes a stale one noticeable is
                    a list that says which of these has not been near this machine in a month. */}
                <span className={s.deviceMeta}>
                  {device.lastSeenAt > 0 ? `${device.fingerprint} · ${describeWhen(device.lastSeenAt)}` : device.fingerprint}
                </span>
              </span>
              {/* Immediate, and it works while the phone is switched off: with the secret gone its frames
                  simply stop opening. Nothing has to reach it. */}
              <button type="button" className={`${s.button} ${s.buttonDanger}`} onClick={() => onRevoke(device.id)}>
                {t.remote.revoke}
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={s.aboutLink} onClick={onAbout}>
        <span className={s.aboutIcon}>i</span>
        <span className={s.rowText}>
          <span className={s.rowLabel}>{t.remote.whatTravels}</span>
          <span className={s.rowSub}>{t.remote.whatTravelsSub}</span>
        </span>
        <svg viewBox="0 0 16 16" aria-hidden="true" className={s.rowChevron}>
          <path
            d="M6.2 3.8L10.4 8l-4.2 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {status.fingerprint && (
        <div className={s.field}>
          <span className={s.screenNote}>{t.remote.fingerprint}</span>
          <code className={s.fingerprint}>{status.fingerprint}</code>
        </div>
      )}
    </div>
  )
}

/**
 * What turning this on actually means.
 *
 * The plain words are the point rather than decoration. Remote access does not "share a view of the
 * feed": it opens a channel that can send messages to an agent that has a shell on this machine, and it
 * sends the conversation - your code included - through a server. A person is entitled to read that
 * before the switch, not in a policy afterwards.
 */
export const RemoteAbout = () => {
  const t = useT()

  return (
    <div className={s.screen}>
      <p className={s.aboutProse}>{t.remote.about.first}</p>
      <p className={s.aboutProse}>{t.remote.about.second}</p>

      <div className={s.aboutList}>
        <div className={s.aboutItem}>
          <span className={s.aboutMarkOk}>✓</span>
          <span>{t.remote.about.can}</span>
        </div>
        <div className={s.aboutItem}>
          <span className={s.aboutMarkNo}>✕</span>
          <span>{t.remote.about.cannot}</span>
        </div>
      </div>

      <p className={s.aboutProse}>{t.remote.about.third}</p>
    </div>
  )
}
