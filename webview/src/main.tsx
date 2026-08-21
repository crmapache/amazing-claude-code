import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { send } from './bridge'
import { Crash } from './components/Crash'
import './base.css'

const container = document.getElementById('root')

if (!container) throw new Error('Root container is missing in index.html')

/**
 * Everything that fell over outside React goes into the IDE's log.
 *
 * The panel lives in an embedded browser rendering offscreen: nobody sees its console, and any error
 * outside the component tree (an event handler, a rejected promise) used to disappear without a trace -
 * leaving only the account "it hung". Now such an account can be checked against the log.
 */
window.addEventListener('error', (event) => {
  send({ type: 'trace', message: `uncaught: ${event.error?.stack ?? event.message}` })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  send({ type: 'trace', message: `unhandled rejection: ${reason?.stack ?? String(reason)}` })
})

createRoot(container).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
