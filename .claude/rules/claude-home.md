---
paths:
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeHome.kt"
  - "src/test/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeHomeTest.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/HostOs.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeHistory.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeSettings.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeTokenUsage.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeCommandHints.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/PromptDelivery.kt"
---

## Где живёт Claude Code - вопрос к проекту, а не к машине IDE

Все читатели диска CLI (история и её страницы, пользовательский слой `settings.json`, личные команды и
скиллы для подсказки, расход токенов за сегодня, поисковый индекс, проверка «дошло ли сообщение до
транскрипта») спрашивают `ClaudeHome.of(project.basePath)`, а не `HostOs.configDirectory()` напрямую.
Причина - отзыв с RubyMine на Windows и проектом внутри WSL: платформа поднимает CLI внутри
дистрибутива, тот видит cwd как `/home/ivan/repo` и пишет в `/home/ivan/.claude/projects/-home-ivan-repo`,
а панель искала в `C:\Users\Ivan\.claude\projects\--wsl-localhost-Ubuntu-home-ivan-repo` - не та машина
и не то имя одновременно, и молча: отсутствие папки с транскриптами - штатное состояние.

- **Для обычного проекта ответ - ровно прежний** (`ClaudeHome.local`): дом JVM или `CLAUDE_CONFIG_DIR`
  из окружения IDE, путь проекта рядом с каноническим. WSL-классы не трогаются вовсе: до них дело
  доходит только на Windows и только для пути, начинающегося с `//` или `\\`.
- **Для WSL-проекта** - дом пользователя дистрибутива (`WSLDistribution.getUserHome`, платформа кэширует),
  его `CLAUDE_CONFIG_DIR` из окружения login-shell (`WSLDistribution.getEnvironment`; однопеременный
  `getEnvironmentVariable` помечен Internal, и верификатор на нём падает), `/etc/claude-code`, слаг из
  Linux-пути, а файлы читаются через
  ту же шару, откуда открыт проект (`WslPath.wslRoot` + Linux-путь). Сами читатели не меняются - меняются
  корень и имя.
- **Пути, напечатанные CLI, переводятся тем же местом** (`ClaudeHome.hostPath`): путь установки плагина
  внутри WSL - Linux-путь, и папку `commands` в нём иначе не открыть.
- **Первый ответ для WSL стоит процесса `wsl.exe`**, поэтому хаб греет его при открытии проекта
  (`ClaudeHome.warmUp`), ответ кэшируется по дистрибутиву, а неудача не кэшируется дольше минуты. С EDT
  спрашивать нельзя: платформа там отвечает null, не блокируя поток, и резолвер честно откатывается к
  локальному ответу с заметкой в `DiagnosticsLog` (без путей и имён - буфер уезжает наружу с отчётом).
- **Арифметика путей вынесена в чистую функцию** (`ClaudeHome.inWsl`) и держится `ClaudeHomeTest`: живьём
  на маке WSL не проверить, а ломается это молча.
- Что здесь НЕ решено и сделано осознанно: поиск исполняемого файла, `--help`/`--version` без рабочего
  каталога и чипы файлов с UNC-путями в сообщении агенту - это отдельная история про запуск в WSL, а не
  про чтение его диска.
