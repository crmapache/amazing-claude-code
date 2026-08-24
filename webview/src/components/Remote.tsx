import { useEffect, useState } from 'react'
import type { RemoteDevice } from '../protocol'
import { QrCode } from './QrCode'
import s from './sideMenu.module.css'

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
const remaining = (expiresAt: number): string => {
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
  return seconds > 60 ? `${Math.ceil(seconds / 60)} min left` : `${seconds}s left`
}

/**
 * What each state means in words a person can act on, and which colour says it before the words are read.
 *
 * Kept apart rather than collapsed into one spinner because the fix differs: a tunnel fixes itself, a
 * relay that is down is somebody else's server, and a refusal will still be a refusal in an hour.
 */
export const REMOTE_STATE: Record<
  RemoteStatus['state'],
  { label: string; hint: string; tone: 'off' | 'busy' | 'live' | 'bad' }
> = {
  idle: { label: 'Off', hint: 'This IDE cannot be reached from outside.', tone: 'off' },
  connecting: { label: 'Connecting…', hint: 'Reaching the relay for the first time.', tone: 'busy' },
  connected: { label: 'Connected', hint: 'A paired device can see this project.', tone: 'live' },
  reconnecting: {
    label: 'Reconnecting…',
    hint: 'The line dropped. This is ordinary - it comes back by itself.',
    tone: 'busy',
  },
  relay_down: {
    label: 'Relay unreachable',
    hint: 'The relay is not answering. Your work is unaffected; only the phone is.',
    tone: 'bad',
  },
  refused: {
    label: 'Refused',
    hint: 'The relay would not have this plugin - it may be too old, or another IDE took this address.',
    tone: 'bad',
  },
}

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

  const meaning = REMOTE_STATE[status.state]
  const colour = TONE_COLOR[meaning.tone]
  const tint = TONE_TINT[meaning.tone]
  const devices = status.devices ?? []

  return (
    <div className={s.screen}>
      <div className={s.stateCard} style={{ borderColor: tint.border, background: tint.background }}>
        <div className={s.stateTop} style={{ color: colour }}>
          <span className={s.stateDot} />
          <span className={s.stateLabel}>{meaning.label}</span>
          <span className={s.stateAgent}>agent {status.agentId || '—'}</span>
        </div>
        <p className={s.stateHint}>{meaning.hint}</p>

        {/* The relay is the part people ask about, so the path is drawn rather than described: one hop
            that forwards, not a service the conversation is handed over to. */}
        <div className={s.path}>
          <span className={s.pathNode}>THIS IDE</span>
          <span className={s.pathLink} />
          <span
            className={`${s.pathNode} ${status.state === 'connected' ? s.pathNodeLive : ''}`}
            style={status.state === 'connected' ? { color: colour } : undefined}
          >
            RELAY
          </span>
          <span className={s.pathLink} />
          <span className={s.pathNode}>DEVICE</span>
        </div>
      </div>

      <button type="button" className={s.switchRow} onClick={() => onToggle(!status.enabled)} aria-pressed={status.enabled}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>Allow this IDE to be reached remotely</span>
          <span className={s.switchHint}>Off until you turn it on, and off again the moment you turn it back.</span>
        </span>
        <span className={`${s.switchTrack} ${status.enabled ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${status.enabled ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      <div className={s.field}>
        <span className={s.screenLabel}>RELAY ADDRESS</span>
        <input
          className={s.input}
          value={relay}
          spellCheck={false}
          placeholder="wss://…"
          onChange={(event) => setRelay(event.target.value)}
          onBlur={() => relay !== status.relay && onRelay(relay)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRelay(relay)
          }}
        />
        <span className={s.screenNote}>
          Empty means the public one. It must be wss:// - a relay over plain http would leave the browser
          without the cryptography this relies on, so it is refused rather than quietly weakened.
        </span>
      </div>

      {status.keysKept === false && (
        <div className={s.screenNote}>
          This IDE is set not to remember passwords, so a pairing will not survive a restart. Turn on the
          IDE&apos;s password safe if you want it to stick.
        </div>
      )}

      {/* A device that has proved it saw the code and is waiting for a person. The proof is not the whole
          story: what it cannot catch is someone who photographed the screen, or saw it in a recording, and
          scanned it first. Comparing the two fingerprints does catch that. */}
      {status.pending && (
        <div className={s.card}>
          <span className={s.switchLabel}>{status.pending.label} wants to pair</span>
          <span className={s.screenNote}>
            The device calls itself that - check the fingerprint below matches the one on its screen.
          </span>
          <code className={s.fingerprint}>{status.pending.fingerprint}</code>
          <div className={s.cardActions}>
            <button type="button" className={`${s.button} ${s.buttonPrimary}`} onClick={onApprove}>
              Allow
            </button>
            <button type="button" className={s.button} onClick={onRefuse}>
              Refuse
            </button>
          </div>
        </div>
      )}

      {status.pairing && !status.pending && (
        <div className={s.card}>
          <span className={s.switchLabel}>Scan this with the phone</span>
          <span className={s.screenNote}>
            {remaining(status.pairing.expiresAt)} · works once. The secret is in the part of the address
            after the hash, which browsers never send to a server.
          </span>
          <div className={s.qr}>
            <div className={s.qrCode}>
              <QrCode value={status.pairing.url} />
            </div>
            <div className={s.qrSide}>
              <code className={s.qrUrl}>{status.pairing.url}</code>
              <button type="button" className={`${s.button} ${s.buttonWide}`} onClick={onCancelPairing}>
                Stop offering
              </button>
            </div>
          </div>
        </div>
      )}

      {status.enabled && !status.pairing && !status.pending && (
        <button type="button" className={`${s.button} ${s.buttonPrimary} ${s.buttonWide}`} onClick={onPair}>
          Pair a device
        </button>
      )}

      {devices.length > 0 && (
        <div className={s.field}>
          <span className={s.screenLabel}>PAIRED DEVICES</span>
          {devices.map((device) => (
            <div key={device.id} className={s.device}>
              <span className={s.deviceText}>
                <span className={s.deviceLabel}>{device.label}</span>
                <span className={s.deviceMeta}>{device.fingerprint}</span>
              </span>
              {/* Immediate, and it works while the phone is switched off: with the secret gone its frames
                  simply stop opening. Nothing has to reach it. */}
              <button type="button" className={`${s.button} ${s.buttonDanger}`} onClick={() => onRevoke(device.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={s.aboutLink} onClick={onAbout}>
        <span className={s.aboutIcon}>i</span>
        <span className={s.rowText}>
          <span className={s.rowLabel}>What travels, and what a phone may do</span>
          <span className={s.rowSub}>Read this before you turn it on</span>
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
          <span className={s.screenNote}>This IDE&apos;s fingerprint</span>
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
export const RemoteAbout = () => (
  <div className={s.screen}>
    <p className={s.aboutProse}>
      With this on, your conversations travel through a relay so a paired phone can read them and answer.
      That includes what the agent reads and writes: source code, file paths, the output of commands.
    </p>
    <p className={s.aboutProse}>
      The relay cannot read any of it - the contents are sealed between this IDE and your phone. It does
      see when you are connected and how much goes by, which is roughly your working hours. You can run a
      relay of your own instead.
    </p>

    <div className={s.aboutList}>
      <div className={s.aboutItem}>
        <span className={s.aboutMarkOk}>✓</span>
        <span>A paired phone can answer permissions, send messages and stop a turn.</span>
      </div>
      <div className={s.aboutItem}>
        <span className={s.aboutMarkNo}>✕</span>
        <span>
          It cannot run shell commands, install plugins, change the permission mode, or touch this
          machine&apos;s clipboard.
        </span>
      </div>
    </div>

    <p className={s.aboutProse}>
      A pairing is proved by a code shown once on this screen. Comparing the two fingerprints catches the
      one thing the code cannot: someone who photographed the screen and scanned it first.
    </p>
  </div>
)
