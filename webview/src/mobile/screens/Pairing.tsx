import { useEffect, useRef, useState } from 'react'
import { unbase64url } from '../../core/crypto'
import { pair, relayAddress } from '../link'
import type { PairedAgent } from '../storage'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

/** What a pairing code says, however it arrived: scanned out of the address bar, or typed in below. */
export interface PairingOffer {
  agentId: string
  secret: Uint8Array
  fingerprint: string
}

interface PairingProps {
  /** Present when the camera brought one - then this screen pairs on its own rather than asking. */
  offer?: PairingOffer | null
  onPaired: (agent: PairedAgent) => void
  onCancel?: () => void
}

/**
 * Letting this phone talk to an IDE.
 *
 * Two ways in, because the platforms differ in a way that cannot be papered over. On Android the
 * camera opens the address and the pairing happens on load. On iOS the storage of an installed app is
 * separate from Safari's, so a code scanned in Safari would pair a browser tab and leave the installed
 * app knowing nothing - which is why a short code typed in here exists at all.
 *
 * The short code has less in it than the scanned one, and what makes that acceptable is the same thing
 * that makes a scan acceptable: the IDE still asks a person to confirm, showing a fingerprint to
 * compare. Neither route grants access by itself.
 */
export const Pairing = ({ offer, onPaired, onCancel }: PairingProps) => {
  const t = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** This phone's own fingerprint - the number the IDE is asking a person to compare against. */
  const [own, setOwn] = useState('')

  /** Both ways in end here, so there is one call to pair and one place a failure is worded. */
  const run = async (details: PairingOffer) => {
    setError('')
    setBusy(true)

    try {
      onPaired(
        await pair(
          relayAddress(),
          details.agentId,
          details.secret,
          details.fingerprint,
          deviceName(),
          setOwn,
        ),
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.mobile.pairing.failed)
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    const [version, agentId, secret, fingerprint] = code.trim().replace(/^.*#/, '').split('.')

    if (version !== '1' || !agentId || !secret || !fingerprint) {
      setError(t.mobile.pairing.notACode)
      return
    }

    void run({ agentId, secret: unbase64url(secret), fingerprint })
  }

  // A scanned code pairs the moment it arrives - that is the whole point of scanning it. Guarded
  // against a second run because the IDE burns a code on its first valid use, and a repeat would be
  // refused and shown as an error on a pairing that had in fact worked. Guarded per code rather than
  // once and for all: a second code scanned while the app was already open is a new one, and refusing
  // to answer it was how a scan onto a running app did nothing at all (see readPairingFragment).
  const started = useRef<PairingOffer | null>(null)
  useEffect(() => {
    if (!offer || started.current === offer) return
    started.current = offer
    void run(offer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer])

  return (
    <div className={m.screen}>
      <header className={m.header}>
        {onCancel && (
          <Back onClick={onCancel} />
        )}
        <span className={m.headerTitle}>{t.mobile.pairing.title}</span>
      </header>

      <div className={m.decisionBody}>
        {offer ? (
          <p className={m.pairingNote}>{t.mobile.pairing.fromCode}</p>
        ) : (
          <p className={m.pairingNote}>{t.mobile.pairing.how}</p>
        )}

        {/* The one check the cryptography cannot make for anybody: that the phone asking is this phone
            rather than someone who photographed the screen and was quicker. It only works if both ends
            show the same number, so this is the device's own - the same one the IDE is displaying. */}
        {own && (
          <>
            <p className={m.pairingNote}>{t.mobile.pairing.fingerprintAsk}</p>
            <p className={m.pairingFingerprint}>{own}</p>
          </>
        )}
        {!offer && (
          <>
            <p className={m.pairingNote}>{t.mobile.pairing.fingerprintNote}</p>

            <textarea
              className={m.pairingInput}
              value={code}
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              placeholder="1.abc…"
              onChange={(event) => setCode(event.target.value)}
            />
          </>
        )}

        {error && <p className={m.pairingError}>{error}</p>}

        {/* Said here rather than only in a store listing: this screen is where somebody agrees to
            their conversations leaving their machine, and that is the moment the answer to "what
            exactly travels, and who can see it" should be one tap away. */}
        <p className={m.pairingNote}>
          <a className={m.pairingLink} href="/privacy" target="_blank" rel="noreferrer">
            {t.mobile.composer.whatTravels}
          </a>
        </p>
      </div>

      <footer className={m.decisionFooter}>
        {/* A scanned code needs no button: it is already being answered. What is left to do is in the
            IDE, so saying so is more use than a control that would only repeat a burnt code. */}
        {!(offer && !error) && (
          <button
            type="button"
            className={m.buttonPrimary}
            disabled={busy || !code.trim()}
            onClick={submit}
          >
            {busy ? t.mobile.pairing.waiting : t.mobile.pair}
          </button>
        )}
        {offer && !error && (
          <p className={m.pairingNote}>{busy ? t.mobile.pairing.waiting : t.mobile.pairing.done}</p>
        )}
      </footer>
    </div>
  )
}

/**
 * What this device calls itself in the IDE's list. A guess from the browser, because there is nothing
 * better to ask - and the IDE shows it as a claim rather than a fact, since it is the device saying it.
 */
const deviceName = (): string => {
  const agent = navigator.userAgent

  if (/iPhone/.test(agent)) return 'An iPhone'
  if (/iPad/.test(agent)) return 'An iPad'
  if (/Android/.test(agent)) return 'An Android phone'
  return 'A browser'
}
