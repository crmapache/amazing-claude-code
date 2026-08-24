import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import { Crash } from '../components/Crash'
import { connect } from './transport'
import '../base.css'

/**
 * The panel opened in an ordinary browser, talking to the IDE over a socket.
 *
 * It renders the very same App - not a copy of it, not a cut-down version. That is the point of the
 * exercise: "two screens showing one conversation" then tests the shell's fan-out rather than a second
 * interface written to test it. Where the two will genuinely differ is a phone (phase 4), and by then
 * the parts they share will have been shared for a while.
 */

const container = document.getElementById('root')

if (!container) throw new Error('Root container is missing in remote.html')

// The shell prints the address with the token in it when it opens the port - see LocalBridgeServer.
const token = new URLSearchParams(window.location.search).get('token') ?? ''

connect({ token })

createRoot(container).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
