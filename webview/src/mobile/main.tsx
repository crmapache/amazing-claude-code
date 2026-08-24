import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '../base.css'
import './mobile.css'

/**
 * The phone client's start.
 *
 * The density attribute goes on before anything renders: the panel's own cards are used as they are,
 * and what makes them usable with a thumb is the metric tokens this switches on (see tokens.css).
 * Setting it after the first paint would show a desktop-dense feed for a frame.
 */

document.documentElement.dataset.accDensity = 'touch'

const container = document.getElementById('root')

if (!container) throw new Error('Root container is missing in mobile.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * The service worker, registered after the first paint rather than before it.
 *
 * It is what shows a notification while the app is closed (phase 5), and what lets the shell open
 * without a network. Neither matters in the first second, and registering it first would delay the
 * screen a person is waiting for.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
  })
}
