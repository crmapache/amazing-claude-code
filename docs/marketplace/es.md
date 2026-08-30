# Amazing Claude Code GUI

**Claude Code como un panel de chat dentro de tu IDE de JetBrains.** Tarjetas en lugar del
desplazamiento de la terminal, archivos que señalas en lugar de rutas que escribes, y tu código
justo al lado.

Usa el propio CLI de Claude Code que ya tienes instalado, así que tu cuenta, los modelos, los
comandos con barra, las reglas de permisos, los servidores MCP y las skills vienen contigo. Sin
proxy y sin ninguna cuenta nuestra.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | **Español** | [Português (Brasil)](pt.md) | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Por qué este

- **Señala los archivos en vez de escribirlos.** Arrastra uno, escribe `@` para elegirlo, pega una
  captura: cada uno entra como una cápsula que no puedes teclear mal.
- **Envía el código con su dirección.** Selecciona las líneas, "Send to Amazing Claude Code GUI",
  y el agente lee el archivo real a su alrededor en vez de un fragmento sin contexto.
- **Cualquier parte de una respuesta es un asa.** Cítala en tu siguiente mensaje o bifurca la
  conversación justo en ese punto: la original se queda tal cual estaba.
- **Ves lo que está haciendo.** Llamadas a herramientas con su duración, diffs con sus cifras, la
  lista de tareas tachándose, planes, subagentes, flotas enteras de agentes dentro de una sola
  llamada de workflow, y lo que costó el turno.
- **Ningún silencio inexplicable.** Si la API está saturada o te limita, aparece una tarjeta con
  el motivo, el número de intento y la cuenta atrás.
- **Nadie responde por ti.** Una petición de permiso, un plan o una pregunta esperan lo que haga
  falta: sin tiempo límite y sin continuación automática.
- **Un panel lateral, no una pestaña del editor**, y en cualquier borde de la ventana.
- **Las conversaciones sobreviven al panel.** Ciérralo, cambia de proyecto, vuelve: el agente
  siguió trabajando y los mensajes en cola siguen en cola.
- **Modelo, esfuerzo y modo cambian a mitad de conversación**, cada pestaña por su cuenta y sin
  reiniciar nada.
- **Contéstale desde el móvil.** Desactivado por defecto, emparejado con un código QR, cifrado de
  extremo a extremo y revocable con un toque.
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

- **Historial** de las conversaciones anteriores de este proyecto, incluidas las que empezaron en
  la terminal.
- **Una cola** para los mensajes escritos mientras corre un turno, reordenable arrastrando.
- **Mejorar el prompt**: la estrella reescribe tu borrador en una ejecución aparte, sin gastar el
  contexto de la conversación, y un botón devuelve tus propias palabras.
- **Dictado por voz** con tu propia clave de Deepgram: mantén pulsada una tecla, incluso desde el
  editor.
- **Avisos sonoros** para los siete momentos que lo merecen, y solo cuando no estás mirando ya.
- **Estadísticas** de horas, hábitos y logros, que puedes compartir como imagen.
- **Nueve idiomas**, siguiendo tu IDE por defecto.
- **Tus búferes sin guardar** se escriben antes de cada turno, y el IDE relee al instante los
  archivos que el agente cambió.

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
