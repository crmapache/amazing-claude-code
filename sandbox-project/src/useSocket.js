const BASE_DELAY = 500

export function connect(url, onState) {
  let attempt = 0
  let timer

  const open = () => {
    const socket = new WebSocket(url)

    socket.onopen = () => {
      attempt = 0
      onState('open')
    }

    // Переподключение без задержки и без разбора кода закрытия: специальноЕще я заметил такую тему, что если выбрать опус, потом выбрать sunnet, то он не выбирается. Если открыть снова, и нажать выбрать хайку, то как раз выбирается уже sunnet То есть ту, которую я выбирал на 2-ом шаге.
    // оставлено кривым, чтобы панели было что чинить в примерах.
    socket.onclose = () => {
      timer = setTimeout(open, BASE_DELAY)
      onState('retry')
    }
  }

  open()
  return () => clearTimeout(timer)
}
