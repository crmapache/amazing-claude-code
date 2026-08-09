import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { send } from './bridge'
import { Crash } from './components/Crash'
import './base.css'

const container = document.getElementById('root')

if (!container) throw new Error('Root container is missing in index.html')

/**
 * Всё, что упало мимо React, — в лог IDE.
 *
 * Панель живёт во встроенном браузере, который рисуется офскрин: его консоль
 * никто не видит, и любая ошибка вне дерева компонентов (обработчик события,
 * сорванный промис) исчезала бесследно — оставался только рассказ «оно
 * повисло». Теперь такой рассказ можно проверить по логу.
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
