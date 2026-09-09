# Amazing Claude Code GUI

**Claude Code como un panel de chat dentro de tu IDE de JetBrains.** Tarjetas en lugar del
desplazamiento de la terminal, archivos que señalas en lugar de rutas que escribes, y tu código
justo al lado.

Usa el propio CLI de Claude Code que ya tienes instalado, así que tu cuenta, los modelos, los
comandos con barra, las reglas de permisos, los servidores MCP y las skills vienen contigo. Sin
proxy y sin ninguna cuenta nuestra.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Українська](uk.md) | **Español** | [Português (Brasil)](pt.md) | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Por qué este

- **Una ronda de trabajo, escrita una vez y ejecutada por ti.** Escenarios: unas pocas tarjetas,
  cada una su propia sesión de Claude - implementar, revisar, corregir, ejecutar las pruebas - en
  etapas que pueden repetirse más de una vez, con un hilo principal que las recorre y evalúa lo que
  encontró cada una. Ejecuta una con un botón, tres a la vez contra tres tickets, o de forma
  programada a las nueve de cada día laborable con sus preguntas ya respondidas de antemano.
  Describe la ronda en una frase y Claude lee el proyecto y escribe el formulario.
- **Todo el panel desde tu móvil, no solo un botón de «sí».** Contesta un permiso o un plan, abre
  un proyecto que está cerrado, lee la conversación de ayer, bifurca, cambia el modelo y el
  esfuerzo, cambia de cuenta, inicia sesión en un conector, dicta, sigue la ejecución de un
  escenario y desbloquéalo. Desactivado por defecto, emparejado con un código QR, cifrado de
  extremo a extremo a través de un relay que no puede leer ni una palabra, revocable con un toque.
- **Varias cuentas de Claude, cambiadas con un clic.** Trabajo y personal en una sola máquina sin
  cerrar sesión en ninguna. Cada fila muestra lo que queda de la ventana de cinco horas de esa
  cuenta y de su semana, y Select mueve a ella cada conversación abierta.
- **Busca en todas las conversaciones del proyecto.** Prefijos, erratas, raíces de palabras, frases
  entre comillas; esta conversación o todas ellas, con un salto directo al mensaje dentro de su
  conversación. Cuando las palabras no bastan, describe lo que buscas y Claude lee las
  conversaciones por ti.
- **Todo lo que hace está en pantalla.** Cada llamada a una herramienta con su duración, cada
  edición como un diff abierto, subagentes y flotas enteras de agentes de workflow con la
  transcripción propia de cada agente a un clic de distancia, la lista de tareas tachándose, y lo
  que costó el turno. Una API saturada o que te limita es una tarjeta con el motivo y la cuenta
  atrás, no silencio.
- **Nada responde por ti, y nada se pierde.** Una petición de permiso, un plan o una pregunta
  esperan lo que haga falta: sin tiempo límite y sin continuación automática. Las conversaciones
  siguen adelante con el panel cerrado o el proyecto cambiado, y los mensajes escritos durante un
  turno esperan en una cola que conserva el IDE.
- **Android Studio incluido**, además de todos los IDE de JetBrains desde 2026.1.

## Primeros pasos

1. Ten Claude Code instalado y funcionando en una terminal: es el CLI que mueve el panel.
2. Abre el panel con el botón de la barra lateral. Si no has iniciado sesión, un botón lo hace en
   la terminal del propio IDE.
3. Escribe tu mensaje: suelta archivos o carpetas en el campo, `@` para un archivo del proyecto,
   `/` para un comando, `!` para ejecutar algo en tu shell.
4. Selecciona código en el editor y elige "Send to Amazing Claude Code GUI": viaja una referencia
   exacta de archivo y líneas, no el texto pegado.
5. Modelo, esfuerzo y modo de permisos son los tres botones bajo el campo, y cada uno pertenece a
   la pestaña que estás mirando.

## Además, en el panel

- **Señala los archivos en vez de escribirlos.** Arrastra uno, escribe `@` para elegirlo, pega una
  captura de pantalla o un registro largo - cada uno entra como una cápsula que no puedes teclear
  mal.
- **Envía el código con su dirección.** Selecciona las líneas, "Send to Amazing Claude Code GUI", y
  el agente lee el archivo real a su alrededor en vez de un fragmento sin contexto.
- **Las rutas abren archivos.** Una ruta en cualquier parte de la conversación - la cabecera de una
  tarjeta, una respuesta, un error, tu propio mensaje - abre el archivo en el editor en la línea
  que nombra; una edición se abre en el lugar de la propia edición.
- **Toma cualquier parte de una respuesta.** Cítala en tu siguiente mensaje, bifurca la
  conversación justo en ese punto, fija hasta tres mensajes encima de la conversación, o devuelve
  un mensaje ya enviado al campo para corregirlo y reenviarlo.
- **Modelo, esfuerzo y modo cambian a mitad de conversación**, cada pestaña por su cuenta y sin
  reiniciar nada. Tú decides con qué empieza una conversación nueva, y puedes añadir a mano un
  modelo de tu propio servidor.
- **Servidores MCP, plugins y marketplaces** en sus propias pantallas: qué servidor está activo,
  cuál necesita iniciar sesión, cuál se ha caído y por qué.
- **Historial** de las conversaciones anteriores de este proyecto, incluidas las que empezaron en
  la terminal, que se abren desde el final y cargan las páginas anteriores bajo demanda.
- **Una cola** para los mensajes escritos mientras corre un turno, reordenable arrastrando.
- **`!` ejecuta un comando en tu propio shell**, y la salida viaja con tu siguiente mensaje, sin
  gastar un turno ni pedir permiso.
- **Mejorar el prompt**: la estrella reescribe tu borrador en una ejecución aparte, sin gastar el
  contexto de la conversación, y un botón devuelve tus propias palabras.
- **Dictado por voz** con tu propia clave de Deepgram: mantén pulsada una tecla, incluso desde el
  editor.
- **Avisos sonoros** para los siete momentos que lo merecen, y solo cuando no estás mirando ya.
- **Estadísticas** de horas, hábitos y logros, que puedes compartir como imagen.
- **Diez idiomas**, siguiendo tu IDE por defecto.
- **Tus búferes sin guardar** se escriben antes de un turno, y los archivos que el agente cambió se
  releen al instante.
- **Un panel lateral, no una pestaña del editor**, en cualquier borde de la ventana; los números
  eligen una opción, Shift+Tab recorre el modo, Escape detiene el turno.

## Privacidad y transparencia

- **Todo corre en tu máquina.** Sin proxy y sin ningún servidor nuestro por el medio. Tu sesión de
  Claude pertenece al CLI: el plugin nunca la lee ni va buscando claves de API por tu disco.
- **Sin telemetría, sin analítica y sin cuenta.** Con el acceso remoto apagado, lo único que sale
  de la máquina es un informe de fallo que tú escribes y envías, y un botón te enseña antes su
  texto exacto.
- **Tus reglas de permisos siguen siendo tuyas.** Qué preguntar lo decide el CLI con tus ajustes,
  tus reglas y tus hooks. El plugin no añade ningún hook propio y nunca arranca una sesión en un
  modo más laxo que el que ves en pantalla.
- **Código disponible** en GitHub bajo la Elastic License 2.0, y la
  [política de privacidad](https://relay.mzpizote.com/privacy) enumera todo lo que puede salir de
  la máquina.

## Requisitos

Claude Code instalado y con sesión iniciada, y cualquier IDE de JetBrains desde 2026.1, Android
Studio incluido. Android Studio no trae navegador integrado propio, así que el IDE te ofrecerá
instalar el plugin de navegador de JetBrains junto a este.

## Enlaces

- [Código fuente](https://github.com/crmapache/amazing-claude-code)
- [Informar de un fallo o pedir una función](https://github.com/crmapache/amazing-claude-code/issues),
  o usa el formulario del propio panel
- [Política de privacidad](https://relay.mzpizote.com/privacy)
