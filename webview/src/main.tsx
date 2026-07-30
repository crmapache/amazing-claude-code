import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './base.css'

const container = document.getElementById('root')

if (!container) throw new Error('Root container is missing in index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
