import type { Dict } from './en'

/**
 * Українська. Переклад англійського словника (див. en.ts), а не окремий текст.
 *
 * Дефіс із пробілами замість тире - так пише оригінал, і всі словники тримають один домашній стиль.
 * Назви продуктів (Claude Code, MCP, Opus, Sonnet, Haiku, Git, PR) та імена інструментів CLI не
 * перекладаються.
 */
export const uk: Dict = {
  common: {
    back: 'Назад',
    close: 'Закрити',
    closeMenu: 'Закрити меню',
    loading: 'Завантаження…',
    cancel: 'Скасувати',
    muted: 'вимк',
    countOn: (n) => `${n} увімк`,
  },

  menu: {
    titles: {
      menu: { title: 'МЕНЮ', hint: 'усе, що панель прибрала з очей' },
      history: { title: 'ІСТОРІЯ', hint: 'минулі розмови цього проєкту' },
      mcp: { title: 'СЕРВЕРИ MCP', hint: 'стан · вхід · перепідключення' },
      plugins: { title: 'ПЛАГІНИ', hint: 'встановлені · каталог · маркетплейси' },
      settings: { title: 'НАЛАШТУВАННЯ', hint: 'як панель поводиться і як звучить' },
      sounds: { title: 'ЗВУКОВІ СИГНАЛИ', hint: 'коли панель вас кличе' },
      calmColors: { title: 'СПОКІЙНІ КОЛЬОРИ', hint: 'яким кольором малюються шкали' },
      remote: { title: 'ВІДДАЛЕНИЙ ДОСТУП', hint: 'стан · релей · прив’язані пристрої' },
      remoteAbout: { title: 'ЩО ЙДЕ НАЗОВНІ', hint: 'прочитайте, перш ніж вмикати' },
      newChat: { title: 'НОВІ ЧАТИ', hint: 'з чим стартує нова вкладка' },
      newChatModel: { title: 'МОДЕЛЬ ЗА ЗАМОВЧУВАННЯМ', hint: 'на чому стартує нова вкладка' },
      newChatEffort: { title: 'ЗУСИЛЛЯ ЗА ЗАМОВЧУВАННЯМ', hint: 'наскільки глибоко думає нова вкладка' },
      newChatMode: { title: 'РЕЖИМ ЗА ЗАМОВЧУВАННЯМ', hint: 'з чого починаються нові вкладки' },
      composerLayout: { title: 'РОЗТАШУВАННЯ ПОЛЯ ВВЕДЕННЯ', hint: 'де стоїть поле введення' },
      pasteCollapse: { title: 'ВСТАВЛЕНИЙ ТЕКСТ', hint: 'коли вставка згортається в чип' },
      sendKey: { title: 'НАДСИЛАННЯ ПОВІДОМЛЕННЯ', hint: 'яка клавіша надсилає' },
      improvePrompt: { title: 'ПОКРАЩЕННЯ ПРОМПТА', hint: 'про що просить кнопка із зірочкою' },
      voice: { title: 'ГОЛОСОВЕ ВВЕДЕННЯ', hint: 'диктувати замість того, щоб друкувати' },
      voiceLanguage: { title: 'МОВА ДИКТУВАННЯ', hint: 'яку мову розпізнавати' },
      voiceDevice: { title: 'МІКРОФОН', hint: 'через який слухати' },
      customModels: { title: 'СВОЇ МОДЕЛІ', hint: 'ті, яких немає в Claude Code' },
      language: { title: 'МОВА', hint: 'якою мовою говорить панель' },
      accounts: { title: 'АКАУНТИ CLAUDE', hint: 'яка підписка платить за роботу' },
      feedback: { title: 'ЗВОРОТНИЙ ЗВ’ЯЗОК', hint: 'баг, ідея або просто привіт' },
      feedbackLog: { title: 'ЩО ДОДАЄТЬСЯ', hint: 'увесь звіт цілком, до відправлення' },
    },

    rows: {
      history: { label: 'Історія', sub: 'Минулі розмови цього проєкту' },
      statistics: { label: 'Статистика', sub: 'Години, звички, досягнення' },
      mcp: { label: 'Сервери MCP', sub: 'Стан, вхід, перепідключення' },
      plugins: { label: 'Плагіни', sub: 'Встановлені, каталог, маркетплейси' },
      remote: { label: 'Віддалений доступ', sub: 'Стан, релей, пристрої' },
      accounts: { label: 'Акаунти Claude', sub: 'Перемкнутися, не виходячи' },
      settings: { label: 'Налаштування', sub: 'Звуки, нові чати, поле введення, мова' },
      feedback: { label: 'Написати нам', sub: 'Баг, ідея або просто привіт' },
    },

    author: {
      title: 'Скоро співбесіда?',
      body: 'Пройдіть її з ШІ-асистентом. Спробуйте безкоштовно',
      tagline: 'підказки просто на співбесіді',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Звукові сигнали', sub: 'Коли панель вас кличе' },
      calmColors: { label: 'Спокійні кольори', sub: 'Скільки кольору лишається шкалам' },
      newChat: { label: 'Нові чати', sub: 'Модель, зусилля та режим дозволів' },
      composerLayout: { label: 'Розташування поля введення', sub: 'Де стоїть поле введення' },
      pasteCollapse: { label: 'Вставлений текст', sub: 'Коли вставка згортається в чип' },
      sendKey: { label: 'Надсилання повідомлення', sub: 'Яка клавіша надсилає' },
      improvePrompt: { label: 'Покращення промпта', sub: 'Про що просить кнопка із зірочкою' },
      voice: { label: 'Голосове введення', sub: 'Диктування за вашим ключем Deepgram' },
      customModels: { label: 'Свої моделі', sub: 'Ті, яких немає в Claude Code' },
      language: { label: 'Мова', sub: 'Якою мовою говорить панель' },
    },

    improveSummary: { builtIn: 'Вбудований', custom: 'Свій' },
  },

  newChat: {
    rows: {
      model: { label: 'Модель', sub: 'На чому стартує нова вкладка' },
      effort: { label: 'Зусилля', sub: 'Наскільки глибоко думає нова вкладка' },
      mode: { label: 'Режим', sub: 'З чого починаються нові вкладки' },
    },
    lastUsed: 'Як у минулій',
    lastUsedNow: (value: string): string => `Іде за останнім вибором - ${value}`,
  },

  customModels: {
    note: 'Claude Code називає моделі, про які знає, і меню показує саме їх. Якщо ви працюєте через проксі або шлюз, впишіть сюди ідентифікатори, які він віддає, - і вони стануть у меню поряд з рештою.',
    warn: 'На звичайному вході в Claude додавати нічого: імені, якого Claude Code не знає, буде відмовлено ще до першого ходу.',
    placeholder: 'ідентифікатор моделі',
    add: 'Додати',
    remove: 'Прибрати',
    added: 'ДОДАНО',
    none: 'Немає',
    count: (n) => {
      const ten = n % 10
      const hundred = n % 100
      if (ten === 1 && hundred !== 11) return `${n} модель`
      if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${n} моделі`
      return `${n} моделей`
    },
  },

  language: {
    note: 'Тільки панель. Якою мовою відповідає сам Claude - це налаштування Claude Code, спільне з терміналом, і його тут ніхто не чіпає.',
    followIde: 'Автоматично',
    followIdeSub: (language) => `Як в IDE - зараз це ${language}`,
    followIdeUnknown: 'Як в IDE',
  },

  sounds: {
    turnFinished: { label: 'Хід завершено', hint: 'Claude відповів і чекає на вас' },
    permission: { label: 'Питають дозвіл', hint: 'виклику інструмента потрібна ваша згода' },
    question: { label: 'Поставили питання', hint: 'Claude просить обрати відповідь' },
    plan: { label: 'План готовий', hint: 'план чекає на ваше рішення' },
    rateLimit: { label: 'Досягнуто ліміт', hint: 'хід зупинено лімітом підписки' },
    extraUsage: {
      label: 'Почалася оплата понад план',
      hint: 'план вичерпано - далі робота оплачується окремо',
    },
    trouble: { label: 'Щось зламалося', hint: 'помилка, мертвий процес або сесія без входу' },
    play: 'Послухати',
    playNamed: (sound) => `Послухати: ${sound}`,
    volumeOf: (sound) => `Гучність: ${sound}`,
  },

  calmColors: {
    sample: 'ШКАЛА НА КОЖНОМУ ЩАБЛІ',
    label: 'Колір шкал',
    hint: 'Уся драбина на 100%, один спокійний тон на 0%',
    keeps: 'Більше нічого не змінюється: помилка лишається червоною, дозвіл - таким, яким він є. Це те, що сталося, а не настрій.',
    full: 'Повний колір',
    none: 'Один тон',
  },

  history: {
    empty: 'Минулих розмов тут поки що немає.',
    today: 'СЬОГОДНІ',
    earlier: 'РАНІШЕ',
    messages: (n) => {
      const rest = n % 100
      if (rest >= 11 && rest <= 14) return `${n} повідомлень`
      const last = n % 10
      if (last === 1) return `${n} повідомлення`
      if (last >= 2 && last <= 4) return `${n} повідомлення`
      return `${n} повідомлень`
    },
  },

  search: {
    title: 'Пошук',
    button: 'Пошук у розмовах',
    tabs: { chat: 'Цей чат', project: 'Усі чати', ai: 'Запитати Claude' },
    placeholder: 'Слова або фраза «в лапках»…',
    aiPlaceholder: 'Опишіть, що шукаєте: про що це було, приблизно коли…',
    aiNote: 'Claude прочитає розмови цього проєкту · окремий запуск, витрачає ваш ліміт',
    find: 'Знайти',
    cancel: 'Скасувати',
    retry: 'Повторити',
    copy: 'Копіювати',
    openInChat: 'Відкрити в чаті',
    aiSearching: 'Читаю розмови…',
    noChat: 'У цій вкладці ще немає розмови - спробуйте всі чати.',
    typeToSearch: 'Результати з’являться тут.',
    aiEmpty: 'Опишіть вище й натисніть «Знайти».',
    nothing: 'Нічого не знайшлося.',
    nothingHere: 'У цьому чаті нічого немає.',
    aiNothing: 'Модель не знайшла нічого підхожого.',
    results: (n) => {
      const rest = n % 100
      if (rest >= 11 && rest <= 14) return `${n} результатів`
      const last = n % 10
      if (last === 1) return `${n} результат`
      if (last >= 2 && last <= 4) return `${n} результати`
      return `${n} результатів`
    },
    inChats: (n, chats) => {
      const rest = chats % 100
      const last = chats % 10
      const one = last === 1 && !(rest >= 11 && rest <= 14)
      return `${n} у ${chats} ${one ? 'чаті' : 'чатах'}`
    },
    showing: (shown, total) => `показано ${shown} з ${total}`,
    places: (n) => {
      const rest = n % 100
      if (rest >= 11 && rest <= 14) return `${n} місць, на які вказує модель`
      const last = n % 10
      if (last === 1) return `${n} місце, на яке вказує модель`
      if (last >= 2 && last <= 4) return `${n} місця, на які вказує модель`
      return `${n} місць, на які вказує модель`
    },
    you: 'Ви',
    more: 'Показати повідомлення повністю',
    less: 'Згорнути',
    clear: 'Очистити',
    matchCase: 'Враховувати регістр',
    wholeWords: 'Лише цілі слова',
    chars: (shown, total) => `${shown} з ${total} символів`,
    failed: 'Пошук не вдався.',
    failedLabel: 'ПОМИЛКА',
    steps: {
      grep: (subject) => `шукала «${subject}»`,
      read: (subject) => `прочитала «${subject}»`,
      list: 'прочитала список розмов',
      other: 'переглянула файли',
      count: (n) => {
        const rest = n % 100
        if (rest >= 11 && rest <= 14) return `${n} кроків`
        const last = n % 10
        if (last === 1) return `${n} крок`
        if (last >= 2 && last <= 4) return `${n} кроки`
        return `${n} кроків`
      },
    },
    capsule: {
      reopen: 'Назад до пошуку',
      close: 'Закрити пошук',
      loading: 'Шукаю повідомлення…',
      missing: 'немає серед завантажених повідомлень',
      previous: 'Попередній збіг у цьому чаті',
      next: 'Наступний збіг у цьому чаті',
    },
  },

  scenarios: {
    title: 'Сценарії',
    hint: 'коло роботи, записане один раз',
    button: 'Сценарії',
    bands: {
      scenarios: 'Сценарії',
      runs: 'Прогони',
      schedule: 'Розклад',
    },
    create: 'Новий сценарій',
    newName: 'Новий сценарій',
    stage: 'Етап',
    asks: {
      one: 'Один прогін зупинився і щось у вас питає',
      many: (n) => {
        const rest = n % 100
        const last = n % 10
        if (last === 1 && !(rest >= 11 && rest <= 14)) return `${n} прогін зупинився і щось у вас питає`
        if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} прогони зупинилися і щось у вас питають`
        return `${n} прогонів зупинилися і щось у вас питають`
      },
      answer: 'Відповісти',
    },
    draft: {
      title: 'Новий сценарій',
      subtitle: 'скажіть, що це за коло робіт - Клод запише',
      label: 'ЩО ЦЕ ЗА РОБОТА',
      hint: 'Опишіть коло робіт, і Клод його запише: що зробити, у якому порядку і що має бути правдою наприкінці.',
      keys: 'Спершу читаються проєкт і ваші скіли; на високому зусиллі це може зайняти кілька хвилин.',
      write: 'Хай напише Клод',
      byHand: 'Зберу сам',
      going: 'Читає проєкт і пише…',
      reading: 'читає проєкт',
    },
    play: 'Запустити',
    unsaved: 'написано Клодом · ще не збережено',
    unsavedNote: 'Прочитайте, перш ніж лишати: ви попросили однією фразою, а повернулися етапи інструкцій агентам.',
    discard: 'Відкинути',
    when: {
      change: 'Змінити цей відкладений запуск',
      changeShort: 'Змінити',
      clear: 'Видалити цей відкладений запуск',
      at: 'О',
      hours: 'Година',
      minutes: 'Хвилини',
      repeat: 'Повтор',
      onDay: 'У день',
      repeats: {
        once: 'Один раз',
        daily: 'Щодня',
        weekdays: 'У будні',
        weekly: 'Раз на тиждень',
      },
      weeklyOn: (day: string): string => `Щоразу в ${day}`,
      next: (when: string): string => `наступний ${when}`,
      then: (when: string): string => `потім ${when}`,
      missed: (when: string): string => `пропущено ${when}`,
      missedShort: 'пропущено',
      inTime: (reading: string): string => `через ${reading}`,
      today: 'СЬОГОДНІ',
      tomorrow: 'ЗАВТРА',
      todayAt: (clock: string): string => `сьогодні ${clock}`,
      yesterdayAt: (clock: string): string => `вчора ${clock}`,
      noAnswers: 'нічого не питає',
      another: 'Запланувати запуск',
      newTitle: 'додаємо',
      editTitle: 'змінюємо',
      clearTitle: 'Видалити цей відкладений запуск?',
      orphan: 'Його сценарію немає на жодній полиці',
      scheduled: (count: number): string => `${count} заплановано`,
      /** The file of hours could not be read at all, which is not the same as having none. */
      unread: 'Відкладені запуски не вдалося прочитати - файл на цій машині, можливо, пошкоджений. Нічого не зникло: поверх непрочитаного списку нічого не пишеться.',
      needsIde: 'Запуститься, лише поки відкрита ця IDE. Година, що минула при закритій, не надолужується - у рядку буде написано, що запуск пропущено.',
      needsIdeShort: 'запускається, лише поки відкрита ця IDE',
      runNow: 'Запустити зараз',
      itAsksFor: 'ВІН ПИТАЄ',
      answeredNow: 'Відповідаємо зараз, бо о тій годині за клавіатурою нікого немає.',
      save: 'Поставити час',
      nothing: 'У цьому проєкті ніщо не чекає своєї години.',
    },
    duplicate: 'Скопіювати',
    delete: 'Видалити',
    deleteTitle: 'Видалити цей сценарій?',
    deleteRun: 'Видалити цей запуск',
    deleteRunTitle: 'Видалити цей запуск?',
    running: 'ЗАРАЗ ІДУТЬ',
    runningNote: 'усі по одній робочій копії',
    runningHere: (n) => {
      const rest = n % 100
      const last = n % 10
      if (last === 1 && !(rest >= 11 && rest <= 14)) return `${n} іде зараз`
      if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} ідуть зараз`
      return `${n} ідуть зараз`
    },
    needsFixing: 'не можна запустити, доки не виправите',
    problemsCount: (n) => {
      const rest = n % 100
      const last = n % 10
      if (last === 1 && !(rest >= 11 && rest <= 14)) return `${n} проблема`
      if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} проблеми`
      return `${n} проблем`
    },
    fix: 'Полагодити',
    stages: (n) => {
      const rest = n % 100
      if (rest >= 11 && rest <= 14) return `${n} етапів`
      const last = n % 10
      if (last === 1) return `${n} етап`
      if (last >= 2 && last <= 4) return `${n} етапи`
      return `${n} етапів`
    },
    cards: (n) => {
      const rest = n % 100
      if (rest >= 11 && rest <= 14) return `${n} карток`
      const last = n % 10
      if (last === 1) return `${n} картка`
      if (last >= 2 && last <= 4) return `${n} картки`
      return `${n} карток`
    },
    hasLoop: 'є цикл',
    asksFor: (names: string): string => `спитає: ${names}`,
    besideGoing: (n) => {
      const rest = n % 100
      const last = n % 10
      if (last === 1 && !(rest >= 11 && rest <= 14)) {
        return 'Почнеться другий прогін поряд із тим, що вже йде. Обидва працюють по одній робочій копії.'
      }
      return `Почнеться прогін поряд із ${n}, що вже йдуть. Усі працюють по одній робочій копії.`
    },
    pastRuns: 'МИНУЛІ ЗАПУСКИ',
    newestFirst: 'спершу нові',
    noRuns: 'Ще нічого не запускали.',
    nothingRunning: 'Зараз у цьому проєкті нічого не йде.',
    spentToday: (amount: string): string => `${amount} сьогодні`,
    runsKept: (n) => {
      const rest = n % 100
      const last = n % 10
      if (last === 1 && !(rest >= 11 && rest <= 14)) return `${n} запуск зберігається`
      if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} запуски зберігаються`
      return `${n} запусків зберігається`
    },
    table: {
      run: 'ЗАПУСК',
      started: 'ПОЧАТО',
      cards: 'КАРТКИ',
      took: 'ЗАЙНЯЛО',
      cost: 'КОШТУВАЛО',
      state: 'СТАН',
    },
    moreRuns: (count: number): string => `Показати ще ${count}`,
    shelves: {
      project: 'У ЦЬОМУ РЕПОЗИТОРІЇ',
      projectNote: 'їде з репозиторієм · є в усіх, хто тут працює',
      user: 'В УСІХ ПРОЄКТАХ',
      userNote: 'лише ваш · ходить з вами з проєкту в проєкт',
      projectEmpty: 'Спільного сценарію поки немає',
      projectEmptyNote: 'Покладіть сюди, і він ляже поряд із командами та скілами проєкту.',
      noProject: 'У цього вікна немає теки проєкту',
      noProjectNote: 'Немає куди покласти сценарій, який поїде з репозиторієм.',
      userEmpty: 'Свого поки немає',
      userEmptyNote: 'Сценарій звідси лише ваш і ходить з вами з проєкту в проєкт.',
    },
    runStates: {
      starting: 'Запускається',
      running: 'Триває',
      paused: 'На паузі',
      blocked: 'Чекає на вас',
      done: 'Готово',
      failed: 'Зірвався',
      stopped: 'Зупинено вами',
    },
    stepStates: {
      waiting: 'Ще ні',
      running: 'Працює',
      asking: 'Запитує',
      judging: 'У головного потоку',
      paused: 'На паузі',
      done: 'Готово',
      failed: 'Не вийшло',
      skipped: 'Не дійшло',
    },
    failures: {
      noHead: 'Головний потік не піднявся',
      noStart: 'Не запустилося',
      tooLong: 'Вийшло за відведений час',
      headSilent: 'Головний потік перестав відповідати',
      crashed: 'Процес зник',
      refused: 'Відмова',
      noVerdict: 'Немає вердикту',
      retries: 'Скінчилися спроби',
      stopped: 'Обірвано вами',
      undone: 'Не зроблено',
    },
    outcomes: {
      scenarioBroken: 'Цей сценарій не можна запустити як є - відкрийте й подивіться, що не так.',
      scenarioNotWritten: 'Сценарій не вдалося записати на диск.',
      scenarioNotDeleted: 'Сценарій не вдалося видалити.',
      schedulesNotWritten: 'Відкладені запуски не вдалося записати на диск.',
      scenarioGone: 'Такого сценарію більше немає.',
      runBusy: 'Цей запуск ще триває - спочатку зупиніть його.',
      scenarioMissingInput: 'Щось із запитаного лишилося порожнім.',
      noClaude: 'Claude Code на цій машині не знайдено.',
      runGone: 'Такого запуску більше немає.',
      runNotResumable: 'Цей запуск не можна продовжити: його головний потік так і не піднявся.',
      unknown: 'Щось пішло не так.',
    },
    run: {
      title: 'ЗАПУСК',
      startedAt: (when) => `почато ${when}`,
      head: 'Головний потік',
      pause: 'Пауза',
      resume: 'Продовжити',
      stop: 'Стоп',
      open: 'Відкрити',
      stopTitle: 'Зупинити цей запуск?',
      stopSubject: 'Те, що картка робить просто зараз, обірветься, а етапи після неї не станеться взагалі.',
      after: {
        stopped: (card) =>
          card ? `Ви зупинили його на картці «${card}». Нічого після неї не запускалося.` : 'Ви зупинили його до першої картки.',
        failed: (card) =>
          card ? `Він став на помилці на картці «${card}».` : 'Він став на помилці до першої картки.',
        done: 'Усі картки зроблено.',
        carryOn: 'Продовжити запуск',
        carryOnHint: 'Підхопить там, де стояв: той самий головний потік з усім, що пам’ятає, а обірваній картці скажуть продовжувати.',
        chat: 'Продовжити в чаті',
        chatHint: 'Відкриє розмову головного потоку окремою вкладкою. Він пам’ятає весь запуск, тож можна продовжити звідти.',
      },
      cards: (done, total) => `${done}/${total} карток`,
      running: 'триває вже',
      runningShort: 'уже',
      openFor: 'відкритий уже',
      took: 'зайняло',
      cost: 'коштувало',
      tokens: 'токенів',
      stageOf: (at: number, total: number): string => `етап ${at} з ${total}`,
      passOf: (pass, passes) => `прохід ${pass} із ${passes}`,
      passOfUpTo: (pass, passes) => `прохід ${pass}, щонайбільше ${passes}`,
      headSaid: 'ГОЛОВНИЙ ПОТІК',
      sentBack: (n) => {
        const rest = n % 100
        const last = n % 10
        if (last === 1 && !(rest >= 11 && rest <= 14)) return 'повернули в роботу 1 раз'
        return `повернули в роботу ${n} раз`
      },
      allow: 'Дозволити',
      deny: 'Відмовити',
      send: 'Надіслати',
      answerPlaceholder: 'Що йому відповісти…',
      asking: 'ВІН ПИТАЄ',
      nothingSpent: 'поки це висить, нічого не витрачається',
      stageDone: (took: string): string => `готово · ${took}`,
      stageHere: 'тут зараз',
      stageNotReached: 'не дійшло',
      notYet: 'ще ні',
      log: 'Лог',
    },
    help: {
      button: 'Що таке сценарії',
      title: 'Сценарії, коротко',
      what: { lead: 'Сценарій', text: '- це коло роботи, яке ви повторюєте, записане один раз: кілька карток, кожна говориться своїй сесії Claude, по черзі.' },
      asks: { lead: 'Перед запуском він може щось запитати', text: '- номер задачі, гілку, усе, що змінюється від запуску до запуску, - і те саме коло роботи щоразу йде за іншим приводом.' },
      run: { lead: 'Натискаєте «Запустити»', text: '- і головний потік проходить їх за вас: розповідає кожній картці, що знайшли попередні, вирішує, чи готова вона, і відповідає на запитання, на яких вони спиняються.' },
      kept: { lead: 'Лежить у репозиторії', text: '- їде разом із ним, і він є в усіх, хто там працює; лежить у всіх проєктах - лише ваш і ходить із вами.' },
      watch: { lead: 'Запуск відкривається своєю вкладкою', text: 'з усіма кроками по порядку. Пауза, продовжити, стоп - а натискання на крок показує всю його розмову.' },
    },
    log: {
      loading: 'Читаю, що він сказав…',
      step: 'Крок',
      head: 'Головний потік',
      missing: 'Запису про цей крок на цій машині немає.',
      main: 'ГОЛОВНИЙ',
    },
    editor: {
      title: 'СЦЕНАРІЙ',
      newTitle: 'НОВИЙ СЦЕНАРІЙ',
      save: 'Зберегти',
      problems: 'Запустити не можна, доки не виправите:',
      warnings: 'ВАРТО ПРИБРАТИ',
      issues: (n) => {
        const rest = n % 100
        const last = n % 10
        if (last === 1 && !(rest >= 11 && rest <= 14)) return `${n} зауваження`
        if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} зауваження`
        return `${n} зауважень`
      },
      outline: 'САМ СЦЕНАРІЙ',
      nameAndShelf: 'Назва і полиця',
      name: 'НАЗВА',
      shelf: 'ЛЕЖИТЬ У',
      inRepository: 'Цьому репозиторії',
      mine: 'Усіх проєктах',
      head: 'Головний потік',
      headNote: 'читає це і за цим судить кожну картку',
      briefingHint: 'Навіщо це коло роботи, вашими словами. Головний потік читає це й за ним судить кожну картку.',
      defaultModel: 'Як у нової вкладки',
      defaultEffort: 'Як у нової вкладки',
      sameAsHead: 'Як у головного потоку',
      onQuestion: 'НА ЗАПИТАННЯ',
      questionHead: 'Відповідає сам',
      questionStop: 'Стати і чекати',
      retries: 'ПОВЕРНЕННЯ',
      noRetries: 'Ніколи',
      retriesCount: (n) => {
        const rest = n % 100
        const last = n % 10
        if (last === 1 && !(rest >= 11 && rest <= 14)) return `Один раз`
        if (last >= 2 && last <= 4 && !(rest >= 11 && rest <= 14)) return `${n} рази`
        return `${n} разів`
      },
      inputs: 'Питає',
      inputsLabel: 'ПИТАЄТЬСЯ ПЕРЕД ЗАПУСКОМ',
      addInput: 'Додати запитання',
      noInputs: 'Перед запуском цей сценарій нічого не запитує.',
      inputName: 'імʼя',
      inputLabel: 'Як назвати у формі',
      required: 'обовʼязково',
      stages: 'ЕТАПИ',
      addStage: 'Додати етап',
      stageNumber: (n) => `Етап ${n}`,
      stageHead: (n: number, title: string): string => `ЕТАП ${n} · ${title}`,
      passes: 'ПРОХОДІВ',
      once: 'один',
      times: (n) => `${n}`,
      goesRound: (n: number): string => `іде по колу ×${n}`,
      goesRoundUntil: (n: number): string => `іде по колу ×${n}, доки не готово`,
      roundsShort: (n: number): string => `×${n}`,
      roundsUntilShort: (n: number): string => `×${n}, доки не готово`,
      untilDone: 'або менше, якщо головний потік скаже, що готово',
      cards: 'КАРТКИ',
      addCard: 'Додати картку',
      addCardHere: 'Додати картку до цього етапу',
      cardTitle: 'Як зветься ця картка',
      prompt: 'ЩО СКАЖУТЬ ЙОГО СЕСІЇ',
      promptHint: 'Що скажуть власній сесії цієї картки. {{імʼя}} запитують перед запуском, [[імʼя]] заповнює головний потік з того, що знайшли картки вище.',
      promptNote: 'Імена слотів підсвічені. Це єдине поле в консольному шрифті.',
      slots: 'СЛОТИ, ЯКІ ВІН ЗАПОВНЮЄ',
      noSlots: 'Немає. Напишіть [[імʼя]] у тексті й опишіть його тут.',
      slotName: 'імʼя',
      slotHint: 'Що головний потік має сюди покласти',
      addSlot: 'Додати слот',
      dod: 'ГОТОВО, КОЛИ',
      dodHint: 'Як головному потоку зрозуміти, що картку завершено. Порожньо - досить того, що хід завершився.',
      after: 'ПЕРЕДАТИ ДАЛІ',
      afterHint: 'Що головному потоку зробити, коли картка готова: щось перевірити, щось занотувати.',
      overrides: 'ПРАЦЮЄ НА',
      moveUp: 'Вище',
      moveDown: 'Нижче',
      remove: 'Прибрати',
      untitledCard: 'Картка без назви',
      untitledStage: 'Етап без назви',
    },
    problems: {
      noStages: 'У ньому немає жодного етапу.',
      emptyStage: 'В етапі немає жодної картки.',
      noPrompt: (card) => `${card}: не написано, що робити його сесії.`,
      unknownInput: (card, name) => `${card}: {{${name}}} цей сценарій не запитує.`,
      undeclaredSlot: (card, name) => `${card}: [[${name}]] стоїть у тексті, але заповнити його нікого не просять.`,
      unusedSlot: (card, name) => `${card}: слот ${name} описано, але в тексті він не використовується.`,
      duplicateInput: (name) => `Два запитання звуться однаково: ${name}.`,
      duplicateSlot: (card, name) => `${card}: два слоти звуться однаково: ${name}.`,
      badInputName: (name) => `«${name}» - не імʼя: годяться літери, цифри, - і _.`,
      badSlotName: (card, name) => `${card}: «${name}» - не імʼя: годяться літери, цифри, - і _.`,
    },
  },

  composerLayout: {
    bottom: 'Звичайна',
    compact: 'Щільна',
    left: 'Ліворуч',
    right: 'Праворуч',
  },

  pasteCollapse: {
    note: 'Довга вставка згортається в чип, щоб стіна тексту не заповнювала поле введення. Рядки рахуються так, як вони ляжуть у самому полі, тож текст, вставлений одним нескінченним рядком, згортається теж. Нічого не втрачається за жодного вибору - згорнута вставка зберігає текст цілком і розгортається назад у поле кнопкою з олівцем.',
    never: 'Ніколи не згортати',
    neverSub: (thousands: number): string =>
      `Усе лишається в полі, окрім вставки, більшої за ${thousands} тисяч символів`,
    from: (lines) => `Від ${lines} рядків`,
    foldLabel: 'Згортати довгі вставки',
    foldSub: (min, max) => `Від якої кількості рядків - від ${min} до ${max}`,
  },

  sendKey: {
    note: 'Якою клавішею йде повідомлення. Друга переносить рядок - тож повідомлення з кількох абзаців набирається однією клавішею в будь-якому разі.',
    enter: 'Enter',
    enterSub: 'Shift+Enter переносить рядок',
    modEnter: (mod: string): string => `${mod}+Enter`,
    modEnterSub: 'Enter переносить рядок',
  },

  improvePrompt: {
    note: 'Кнопка із зірочкою поряд зі скріпкою переписує те, що стоїть у полі введення. Ось про що вона просить. Іде це окремим запуском Claude Code - без інструментів, без файлів, без розмови - і витрачає ліміт як звичайне повідомлення.',
    label: 'ІНСТРУКЦІЇ',
    emptyMeans: 'Порожньо означає сірий текст вище - той, з яким кнопка працює з коробки.',
    builtInLanguage:
      'Він англійською, бо це інструкція моделі, а не частина інтерфейсу: вона сама просить відповідь мовою чернетки. Свій текст можна писати будь-якою мовою.',
    editBuiltIn: 'Відкрити вбудований текст',
    backToBuiltIn: 'Повернути вбудований текст',
  },

  voice: {
    note: 'Тримайте клавішу і говоріть - слова з’являються в полі під час мовлення. Працює за вашим ключем Deepgram: звук іде в Deepgram і більше нікуди, свого сервера плагін не має.',
    off: 'Вимкнено',
    enable: 'Голосове введення',

    key: 'КЛЮЧ DEEPGRAM',
    keyPlaceholder: 'Вставте ключ',
    keySet: (tail: string): string => `Ключ збережено, закінчується на ${tail}`,
    keySave: 'Зберегти',
    keyForget: 'Забути цей ключ',

    balanceLeft: (amount: string): string => `На рахунку лишилося ${amount}`,
    balanceChecking: 'Питаємо Deepgram…',
    balanceNoKey: 'Ключа поки що немає.',
    balanceNoAccess: 'Ключ працює. Щоб бачити баланс, потрібен ключ із роллю Owner або Admin.',
    balanceRejected: 'Deepgram не визнає цей ключ.',
    balanceFailed: 'Не вдалося достукатися до Deepgram. Перевірте мережу і спробуйте ще раз.',
    balanceRefresh: 'Оновити',

    getKey: 'Ключа ще немає?',
    getKeyHint: 'Зареєструйтеся на deepgram.com і створіть API-ключ. $200 кредиту без картки.',
    openSite: 'Відкрити deepgram.com',

    hotkeys: 'ГАРЯЧІ КЛАВІШІ',
    push: 'Тримати і говорити',
    pushHint: 'Пише, поки клавішу затиснуто, і зупиняється, коли її відпустили.',
    hold: 'Руки вільні',
    holdHint: 'Одне натискання починає, наступне завершує.',
    keyboard: 'КЛАВІША',
    mouse: 'МИША',
    record: 'Задати',
    recording: 'Натисніть клавішу…',
    recordingMouse: 'Натисніть кнопку…',
    notSet: 'Не задано',
    clear: 'Очистити',
    sideLeft: 'Лівий',
    sideRight: 'Правий',
    badButton: 'Годяться лише бічні кнопки миші - три основні вже щось означають у будь-якому місці IDE.',

    language: 'Мова диктування',
    languageHint: 'Яку мову розпізнавати',
    searchLanguages: 'Пошук мови…',
    multiHint: 'Мультимова стежить за зміною мови посеред фрази. За вимірами вона програє названій мові в обох випадках - беріть її, тільки якщо ви справді змішуєте дві мови в одному реченні.',

    device: 'Мікрофон',
    deviceHint: 'Через який слухати',
    deviceDefault: 'Системний за замовчуванням',
    deviceDefaultHint: 'Іде за налаштуванням системи',
    deviceNote: 'Зміна набуде чинності з наступного диктування.',

    promo: {
      title: 'Подобається диктувати тут?',
      body: 'Затисніть клавішу й говоріть у будь-якому іншому вікні - мій другий застосунок впише вашу мову туди, де ви працюєте. Зареєструйтеся зараз - і для вас це залишиться безкоштовним назавжди.',
      tagline: 'диктування для Mac і Windows',
    },

    errorNoKey: 'Спершу додайте ключ Deepgram - Налаштування, потім Голосове введення.',
    errorNoKeyRemote: 'На машині, де йде ця розмова, немає ключа Deepgram - додайте його там, у налаштуваннях, у розділі голосового введення.',
    errorOff: 'На машині, де йде ця розмова, голосове введення вимкнено - увімкніть його там, у налаштуваннях.',
    errorMicrophone: 'Мікрофон не відкрився. Можливо, його тримає інша програма.',
    errorKey: 'Deepgram не прийняв ключ. Перевірте його на екрані голосового введення.',
    errorNetwork: 'Не вдалося достукатися до Deepgram. Перевірте мережу і спробуйте ще раз.',
    errorGeneral: 'Диктування перервалося. Спробуйте ще раз.',
  },

  modes: {
    manual: {
      label: 'Питати дозвіл',
      sub: 'Читає вільно, питає перед кожним записом і кожною командою.',
      short: 'Питає',
    },
    acceptEdits: {
      label: 'Приймати правки',
      sub: 'Сам схвалює правки файлів у робочому каталозі. Про команди все одно спитає.',
      short: 'Правки',
    },
    plan: {
      label: 'План',
      sub: 'Вивчає і пропонує план. Нічого не чіпає, доки ви не схвалите.',
      short: 'План',
    },
    auto: {
      label: 'Авто',
      sub: 'Без питань - кожну ризиковану дію перевіряє класифікатор. Є не в усіх моделей.',
      short: 'Авто',
    },
    dontAsk: {
      label: 'Не питати',
      sub: 'Ніколи не питає; відмовляє в усьому, що не схвалено заздалегідь. Для запусків без нагляду.',
      short: 'Мовчки',
    },
    bypassPermissions: {
      label: 'Обходити дозволи',
      sub: 'Пропускає майже всі перевірки. Про небезпечні видалення все одно спитає. Лише контейнери та одноразові віртуалки.',
      short: 'Обхід',
    },
    tags: {
      default: 'за замовчуванням',
      readOnly: 'тільки читання',
      preview: 'прев’ю',
      settings: 'налаштування',
      danger: 'небезпечно',
    },
  },

  effort: {
    auto: { sub: 'Повертає зусилля, яке стоїть у моделі за замовчуванням для цієї сесії.' },
    ultracode: {
      sub: 'Міркування рівня xhigh плюс багатоагентні сценарії, коли задача цього вимагає.',
    },
    max: { sub: 'Усе, що є. Архітектура і заплутані баги.' },
    xhigh: { sub: 'Того самого більше - для правок, що розходяться по багатьох файлах.' },
    high: { sub: 'Довге міркування перед дією. Правки в кількох файлах.' },
    medium: { sub: 'Золота середина. Хороший варіант за замовчуванням для роботи над фічами.' },
    low: { sub: 'Майже без роздумів. Механічні правки і швидкі відповіді.' },
    tags: { ultra: 'ultra', slow: 'повільно', default: 'за замовчуванням' },
  },

  models: {
    default: { label: 'За замовчуванням (рекомендуємо)', sub: 'Модель, з якої починається ця сесія.' },
    opus: { sub: 'Opus 5 · Найкращий для щоденних і складних задач' },
    opus1m: {
      label: 'Opus (контекст 1M)',
      sub: 'Opus 5 з контекстом 1M · Для довгих сесій на великих кодових базах',
    },
    fable: { sub: 'Fable 5.1 · Для найскладніших і найдовших задач' },
    sonnet: { sub: 'Sonnet 5 · Ощадливий на рутинних задачах' },
    sonnet1m: {
      label: 'Sonnet (контекст 1M)',
      sub: 'Sonnet 5 з контекстом 1M · Для довгих сесій на великих кодових базах',
    },
    haiku: { sub: 'Haiku 4.5 · Найшвидший на коротких відповідях' },
    opusplan: { label: 'Opus у режимі плану', sub: 'Opus у режимі плану, Sonnet в усьому іншому' },
    unavailable: 'недоступна',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code сам перейшов на цю модель.',
    custom: 'Додана вами',
    add: 'Додати модель…',
    addSub: 'Ту, якої немає в Claude Code',
  },

  composer: {
    placeholder: 'Запитайте або опишіть правку…',
    placeholderPlan: 'Опишіть, що спланувати…',
    attach: 'Прикріпити файли або теки',
    slash: 'Слеш-команди',
    improve: 'Покращити промпт',
    improveAgain: 'Ще варіант, від ваших слів',
    restore: 'Повернути мої слова',
    stop: 'Стоп',
    forceStop: 'Не відповідає · Убити процес',
    forceStopHint: 'Claude не підтверджує зупинку',
    queue: 'У чергу',
    queueHint: 'Надішлеться, коли поточний хід завершиться',
    send: 'Надіслати',
    run: 'Виконати',
    runHint: 'Виконається у вашій оболонці - Claude побачить вивід із наступним повідомленням',
    improveEmpty: 'Claude Code відповів порожнечею - у поле нічого класти.',
    improveChanged: 'Поки тривало переписування, чернетка змінилася - її не чіпали.',
    improveTerminal: 'Команду для оболонки не переписують',
    voice: 'Диктувати',
    voiceStop: 'Завершити диктування',
  },

  header: {
    idle: 'Спокій',
    running: 'Claude працює',
    done: 'Хід завершено',
    attention: 'Чекає на вас',
    crashed: 'Сесія несподівано обірвалася',
    statistics: 'Статистика',
    closeStatistics: 'Закрити статистику',
    scenarios: 'Сценарії',
    closeScenarios: 'Закрити сценарії',
    closeRun: 'Закрити цей запуск',
    conversations: 'Розмови',
    newSession: 'Нова розмова',
    menu: 'Меню',
    watchers: (n) => `За цим проєктом стежать ще: ${n}`,
  },

  thanks: {
    button: 'Подобається плагін? Скажіть дякую',
    title: 'СКАЗАТИ ДЯКУЮ',
    star: 'Зірка на GitHub',
    starSub: 'Допомагає іншим знайти плагін',
    rate: 'Оцінити на сторінці плагіна',
    rateSub: 'Відгук у JetBrains Marketplace',
    share: 'Поділитися з друзями',
    shareSub: 'Скопіює рядок про плагін і посилання',
    shareCopied: 'Скопійовано - вставте, куди схочете',
    shareText:
      'Глянь Amazing Claude Code GUI - Claude Code нормальною панеллю просто в IDE від JetBrains: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Шукаємо Claude Code…',
    notFound: 'Claude Code не знайдено',
    notFoundText:
      'Панель працює через CLI claude. Якщо він встановлений, вкажіть шлях до нього - PATH в IDE не завжди той самий, що у вашому терміналі.',
    useThis: 'Використати',
    whereLooked: 'Де панель шукала',
    checkAgain: 'Перевірити ще раз',
    orSwitch: 'Або перемкніться на інший акаунт:',
    signIn: 'Увійдіть у Claude Code',
    /** Which account the button fills: the sign-in goes into that account's drawer. */
    signInAs: (account: string): string => `Увійдіть в акаунт ${account}`,
    signInText:
      'Вхід робиться один раз, у терміналі IDE: Claude відкриє браузер і зачекає, поки ви повернетеся. Панель підхопить вхід сама.',
    logIn: 'Увійти',
    openTerminalAgain: 'Відкрити термінал знову',
    finishInTerminal: 'Завершіть вхід у терміналі - цей екран закриється сам.',
    /** The sign-in could not even start - see the `authProblem` message. */
    noDrawer:
      'Панель не бачить сховище входу цього акаунта, тож входу нікуди лягти. Перемкніться нижче на інший акаунт.',
    noTerminal: 'IDE не відкрила термінал, а вхід робиться саме в ньому.',
    switchAccount: 'Змінити акаунт',
    sendAgainAfter: 'Завершіть вхід у терміналі та надішліть повідомлення ще раз.',
  },

  stream: {
    waitingForYou: 'Чекає на вас',
    waitingForSubagent: 'Чекає субагента',
    waitingForSubagents: (n) => `Чекає субагентів: ${n}`,
    thinking: 'Claude думає',
    retryWaiting: (label, waited) => `${label} · чекаємо ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'Впало, не закінчивши.',
    stoppedBeforeFinishing: 'Зупинено, не закінчивши.',
    backgroundEnded: (outcome, duration) =>
      duration ? `Фонова команда ${outcome} за ${duration}.` : `Фонова команда ${outcome}.`,
    outcomeFailed: 'впала',
    outcomeStopped: 'зупинена',
    outcomeFinished: 'відпрацювала',
    trimmed: (n) => `…згорнуто минулих кроків: ${n}`,
  },

  feed: {
    empty: { title: 'Запитайте Claude про цей проєкт', hint: '@ - файли · / - команди' },
    you: 'ВИ',
    jumpToLatest: 'До останнього повідомлення',
    copyBlock: 'Скопіювати цей блок',
    copyReply: 'Скопіювати відповідь цілком',
    moreActions: 'Ще',
    copyMessage: 'Скопіювати повідомлення - зі шляхами до вкладень',
    reuse: {
      label: 'Виправити й надіслати знову',
      hint: 'Повернути повідомлення в поле введення, щоб виправити й надіслати знову',
      lostImages: (n: number): string =>
        n === 1
          ? 'Повернеться в поле введення, але вставлена картинка - ні, додайте її знову'
          : `Повернеться в поле введення, але ${n} вставлених картинок - ні, додайте їх знову`,
    },
    pin: {
      add: 'Закріпити вгорі чату',
      crowded: 'Більше трьох не можна - спершу відкріпи одне з них, потім закріплюй це',
      remove: 'Відкріпити',
    },
    pastedLines: (n) => {
      const rest = n % 100
      const last = n % 10
      if (rest >= 11 && rest <= 14) return `вставлено ${n} рядків`
      if (last === 1) return `вставлено ${n} рядок`
      if (last >= 2 && last <= 4) return `вставлено ${n} рядки`
      return `вставлено ${n} рядків`
    },
    pasteClose: 'Згорнути назад',
    copyPaste: 'Скопіювати вставлений текст',
    pasteShown: (shown, total) => {
      const rest = shown % 100
      const last = shown % 10
      const word =
        rest >= 11 && rest <= 14
          ? 'рядків'
          : last === 1
            ? 'рядок'
            : last >= 2 && last <= 4
              ? 'рядки'
              : 'рядків'
      return `Показано ${shown} ${word} з ${total} · копіюється цілком`
    },
    fromOutput: 'з виводу',

    think: {
      chip: 'ДУМКИ',
      thoughts: (n) => {
        const rest = n % 100
        const last = n % 10
        if (rest >= 11 && rest <= 14) return `${n} думок`
        if (last === 1) return `${n} думка`
        if (last >= 2 && last <= 4) return `${n} думки`
        return `${n} думок`
      },
    },

    workflow: {
      agents: (n) => {
        const rest = n % 100
        const last = n % 10
        if (rest >= 11 && rest <= 14) return `${n} агентів`
        if (last === 1) return `${n} агент`
        if (last >= 2 && last <= 4) return `${n} агенти`
        return `${n} агентів`
      },
      running: (n) => `${n} у роботі`,
      done: (n) => `${n} готово`,
      failed: (n) => `${n} впало`,
      queued: 'у черзі',
      skipped: 'пропущено',
      dropped: 'обірвано',
      attempt: (n) => `спроба ${n}`,
      cached: 'із журналу',
      steps: 'ЩО РОБИВ',
      returned: 'ЩО ПОВЕРНУВ',
      cut: 'Обрізано - відповідь довша, ніж тут вміщується.',
      noTranscript: 'Його запису на диску вже немає - це витяг зі звіту.',
      reading: 'Читаю його запис…',
    },

    tool: {
      running: '· іде',
      waitingForYou: '· чекає на вас',
      failed: '· помилка',
      lines: (n) => `· рядків: ${n}`,
      matches: (n) => (n > 0 ? `· збігів: ${n}` : '· нічого не знайшлося'),
      output: (empty) => (empty ? '· без виводу' : '· є вивід'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… ще рядків: ${n}`,
      fewerLines: '… згорнути',
      count: (n) => `інструментів: ${n}`,
      closed: {
        replay: 'У збереженій розмові результату цього виклику немає.',
        exited: 'Claude Code перестав відповідати, не дочекавшись кінця.',
        stopped: 'Зупинено, не закінчивши.',
        turnEnded: 'Хід завершився раніше, ніж цей виклик.',
        untracked: 'Усе ще працює у фоні - панель за ним більше не стежить.',
        restarted: 'Claude Code тут перезапустився - це не пережило перезапуск.',
      },
      closedMeta: {
        replay: '· немає в транскрипті',
        exited: '· перервано',
        stopped: '· перервано',
        turnEnded: '· не завершено',
        untracked: '· відпущено',
        restarted: '· не пережило перезапуск',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `Працює · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'ЩО ЙОМУ ДОРУЧИЛИ',
      closed: {
        replay: 'Чим це скінчилося, у збереженій розмові не записано.',
        exited: 'Сесія скінчилася раніше, ніж прийшла відповідь.',
        stopped: 'Зупинено, не дочекавшись відповіді.',
        turnEnded: 'Хід завершився раніше, ніж прийшла відповідь.',
        untracked: 'Усе ще працює - панель за цим більше не стежить.',
        restarted: 'Claude Code тут перезапустився - цей агент не пережив перезапуск.',
      },
    },

    bash: { running: 'іде', noOutput: 'без виводу' },

    checkpoint: {
      cleared: 'розмову очищено - усе, що вище, більше не пам’ятається',
      earlier: 'повідомлення вище',
      notKept: 'початок розмови більше не зберігається',
      notOnPhone: 'початок розмови на телефон не надсилають',
      loadEarlier: 'завантажити повідомлення вище',
    },

    compact: {
      label: 'КОНТЕКСТ',
      running: 'Стискаю розмову…',
      done: (manual) => `контекст стиснуто ${manual ? 'вручну' : 'автоматично'}`,
      doneWith: (manual, before, after, took) =>
        `${manual ? 'вручну' : 'автоматично'} стиснув ${before} контексту у ${after ? `конспект на ${after}` : 'конспект'}${took ? ` за ${took}` : ''}`,
    },

    retry: {
      label: 'ПОВТОР',
      reason: {
        rateLimited: 'Занадто часто',
        overloaded: 'API перевантажено',
        auth: 'Не пускає за ключем',
        error: 'Помилка API',
      },
      attempt: (n) => `спроба ${n}`,
      attemptOf: (n, max) => `спроба ${n}/${max}`,
      retryingIn: (seconds) => `повтор через ${seconds} с`,
      retrying: 'повторюю…',
      recovered: (attempts) => `пройшло з ${attempts}-ї спроби`,
      failed: (attempts) => `здався після ${attempts}-ї спроби`,
      stopped: (attempts) => `зупинено на ${attempts}-й спробі`,
    },

    result: {
      worked: (duration) => (duration ? `Працював ${duration}` : 'Працював'),
      stopped: (duration) => (duration ? `Зупинено вами · ${duration}` : 'Зупинено вами'),
      movedAccount: (duration) => (duration ? `Зупинено для зміни акаунта · ${duration}` : 'Зупинено для зміни акаунта'),
      restarted: 'Claude Code перезапустився - усе, що ще працювало, обірвалося',
    },

    modelSwitch: { label: 'МОДЕЛЬ', note: 'перемкнув Claude Code, а не ви' },
    modelStuck: {
      label: 'МОДЕЛЬ',
      note: (running) => `обрано, але відповіді й далі йдуть на ${running}`,
      hint: 'Вибір не дійшов до Claude Code - спробуйте обрати модель ще раз.',
    },

    crash: {
      label: 'СЕСІЯ',
      text: 'Claude Code завершився несподівано.',
      textWithCode: (code) => `Claude Code завершився несподівано (код виходу ${code}).`,
    },

    limit: {
      label: 'ЛІМІТ',
      extraLabel: 'ОПЛАТА ПОНАД ПЛАН',
      extra: (window) =>
        `${window ? `Ліміт «${window}»` : 'Ліміт підписки'} вичерпано - робота триває понад план, за окремі гроші`,
      waiting: (window) => `${window ? `Ліміт «${window}»` : 'Ліміт підписки'} вичерпано - чекаємо, коли він скинеться`,
      resetAt: (clock, left) => `${clock} · через ${left}`,
    },

    plan: {
      label: 'ПЛАН ГОТОВИЙ',
      steps: (n) => `· кроків: ${n}`,
      approve: 'Схвалити і робити',
      keepPlanning: 'Продовжити планувати',
      withdrawn: 'Агент перестав чекати рішення',
    },

    ask: {
      label: 'CLAUDE ПИТАЄ',
      blocks: (n) => {
        const rest = n % 100
        const last = n % 10
        const word =
          rest >= 11 && rest <= 14
            ? 'питань'
            : last === 1
              ? 'питання'
              : last >= 2 && last <= 4
                ? 'питання'
                : 'питань'
        return `${n} ${word} · тримає хід`
      },
      pickAny: 'можна кілька',
      other: 'Інше',
      ownAnswer: 'напишіть свою відповідь…',
      send: 'Надіслати відповіді',
      pickToContinue: 'Оберіть, щоб продовжити',
      note: 'хід продовжиться рівно з того місця, де спитав',
      expand: 'Розгорнути питання',
      collapse: 'Згорнути питання',
      dismiss: 'Закрити питання',
      dismissHint: 'Закрити і відповісти своїми словами',
    },

    findings: {
      label: 'РЕВ’Ю',
      fixed: 'виправлено',
      skipped: 'пропущено',
      noChange: 'правити нічого',
      unconfirmed: 'не підтверджено',
    },

    copy: { copied: 'Скопійовано', click: 'Натисніть, щоб скопіювати', openFile: 'Відкрити в редакторі', openFolder: 'Показати теку' },
  },

  chrome: {
    tasks: {
      label: 'ЗАДАЧІ',
      listLabel: 'СПИСОК ЗАДАЧ',
      progress: (done, total) => `${done} / ${total} готово`,
      collapse: 'Згорнути список задач',
      expand: 'Показати решту задач',
    },
    queue: {
      label: 'У ЧЕРЗІ',
      hint: (n) => `Підуть по черзі, коли хід завершиться: ${n} · порядок змінюється перетягуванням`,
    },
    selection: { quote: 'Цитувати', fork: 'Розвилка звідси' },
    streams: {
      main: 'основний',
      background: 'фон',
      stopAgent: 'Зупинити цього агента',
      stopAgentNamed: (name) => `Зупинити: ${name}`,
      stopAgentTitle: 'Зупинити цього агента?',
      stopCommand: 'Зупинити цю команду',
      stopCommandTitle: 'Зупинити цю команду?',
    },
    confirm: { cancel: 'Скасувати', stop: 'Зупинити' },
    noChats: { title: 'Радий попрацювати разом!', button: 'Почнімо' },
    crash: {
      title: 'Панель спіткнулася об помилку',
      text: 'Перезавантажити безпечно: розмови живуть у процесах Claude Code за панеллю і переживуть її.',
      button: 'Перезавантажити панель',
    },
  },

  /**
   * Several Claude accounts on one machine.
   *
   * The plan names (`max`, `pro`, `team`), the address and the organisation's name are DATA and are
   * deliberately absent from here: they are the same word in every language, and putting them in a
   * dictionary would mean nine entries in SHARED_WITH_ENGLISH for each (see the note on AUTHOR_PRODUCT).
   */
  accounts: {
    empty: { title: 'Робочий і особистий — поруч', body: 'Перемикайтеся між акаунтами Claude без виходу. Скіли, хуки, налаштування та історія лишаються спільними.' },
    intro:
      'Усе працює на вибраному тут акаунті - на нього переїжджають усі відкриті розмови, а той, де триває хід, для цього зупиняється.',
    /** An account whose sign-in has not landed, so nobody knows its address yet. */
    unnamed: 'Входимо…',
    defaultName: 'Вхід у Claude Code',
    current: 'у роботі',
    signingIn: 'входимо',
    use: 'Вибрати',
    switching: 'Перемикаємо…',
    rename: 'Перейменувати',
    save: 'Зберегти',
    logout: 'Вийти',
    logoutConfirm: 'Вийти з Claude Code?',
    forget: 'Забути',
    add: 'Додати акаунт',
    adding: 'Чекаємо на вхід…',
    cancel: 'Скасувати',
    addHint: 'Для входу відкриється термінал. Ваш нинішній акаунт лишиться недоторканим.',
    mcpNote: 'Сервери MCP входять окремо на кожному акаунті, тож новий доведеться авторизувати один раз. Скіли, хуки, налаштування та історія - спільні.',
    designAuthorize: 'Авторизувати Claude Design',
    designNote: 'Claude Design теж входить окремо на кожному акаунті, і зробити це може лише термінал. Він відкриється для того акаунта, на якому ви працюєте; далі DesignSync працює в панелі сам.',
    aliasPlaceholder: 'Робота, дім, клієнт…',
    /**
     * Presence, not validity: the CLI answers "signed in" for any credential it can read, including one
     * revoked last week. So the words say what is actually known.
     */
    absent: 'Збережених даних входу немає. Увійдіть знову, щоб користуватися цим акаунтом.',
    /** The figures beside a row - short, because they sit on one line under the name. */
    fiveHour: '5 год',
    weekly: 'тиждень',
    row: {
      /** The value on the menu row when there is nothing to switch between. */
      one: 'Один акаунт',
      adding: 'Входимо…',
    },
    /**
     * Why the machine cannot keep two sign-ins apart. One sentence each, and each names the real reason
     * rather than "unavailable" - a person who reads why can usually do something about it.
     */
    unavailable: {
      ignored: 'Цей Claude Code не вміє тримати два входи окремо. Оновіть його і відкрийте цей екран знову.',
      wsl: 'Недоступно для проєкту всередині WSL: Claude Code працює там, а не на цій машині.',
      not_signed_in: 'Спершу увійдіть у Claude Code, а тоді додайте тут другий акаунт.',
      api_key: 'Ця машина входить за ключем API, а він діє на всі розмови. Поки він заданий, акаунти перемкнути не можна.',
    },
    /** How a request went. Codes rather than sentences from the IDE, which speaks one language. */
    outcome: {
      'did-not-land': 'Той вхід не завершився, тож нічого не додано.',
      'no-terminal': 'Термінал не відкрився, тож вхід так і не почався.',
      'no-executable': 'Claude Code не знайдено на цій машині.',
      'no-store': 'Не вдалося створити теку для нового акаунта.',
      'design-no-account': 'Акаунт, на якому ви працюєте, не вдалося визначити, тож нічого не відкрилося.',
      'not-supported': 'Цей Claude Code не вміє тримати два входи окремо, тож нічого не додано.',
      'logout-failed': 'Вийти не вдалося. Спробуйте в терміналі.',
      'already-running': 'Вхід уже триває.',
      unknown: 'Не вийшло.',
    } as Record<string, string>,
  },

  remote: {
    codeLabel: 'Код для пари',
    states: {
      idle: { label: 'Вимкнено', hint: 'До цієї IDE ззовні не достукатися.' },
      connecting: { label: 'Підключаємося…', hint: 'Перший вихід на релей.' },
      connected: { label: 'Підключено', hint: 'Прив’язаний пристрій бачить цей проєкт.' },
      reconnecting: {
        label: 'Перепідключаємося…',
        hint: 'Зв’язок обірвався. Це звична річ - він повернеться сам.',
      },
      unreachable: {
        label: 'Релей недоступний',
        hint: 'Релей не відповідає. На роботу це не впливає - тільки на телефон.',
      },
      refused: {
        label: 'Відмовлено',
        hint: 'Релей не прийняв цей плагін: можливо, він застарілий, або ця адреса зайнята іншою IDE.',
      },
    },
    agent: (id) => `агент ${id}`,
    thisIde: 'ЦЯ IDE',
    relay: 'РЕЛЕЙ',
    device: 'ПРИСТРІЙ',
    allow: 'Дозволити віддалений доступ до цієї IDE',
    allowHint: 'Вимкнено, доки ви не увімкнете, і вимикається одразу, щойно вимкнете назад.',
    relayAddress: 'АДРЕСА РЕЛЕЯ',
    noSafe:
      'Ця IDE налаштована не запам’ятовувати паролі, тому прив’язка не переживе перезапуск. Увімкніть сховище паролів IDE, якщо хочете, щоб вона трималася.',
    wantsToPair: (device) => `${device} просить прив’язку`,
    checkFingerprint: 'Пристрій так себе називає - звірте відбиток нижче з тим, що в нього на екрані.',
    allowDevice: 'Дозволити',
    refuse: 'Відмовити',
    scanThis: 'Відскануйте це телефоном',
    codeNote: (left) =>
      `${left} · працює один раз. Секрет лежить у частині адреси після решітки, а її браузери на сервер не надсилають.`,
    minutesLeft: (minutes) => `лишилося ${minutes} хв`,
    secondsLeft: (seconds) => `лишилося ${seconds} с`,
    stopOffering: 'Більше не пропонувати',
    pairDevice: 'Прив’язати пристрій',
    pairedDevices: 'ПРИВ’ЯЗАНІ ПРИСТРОЇ',
    revoke: 'Відв’язати',
    whatTravels: 'Що йде назовні і що телефону можна',
    whatTravelsSub: 'Прочитайте, перш ніж вмикати',
    fingerprint: 'Відбиток цієї IDE',
    about: {
      first:
        'З цим увімкненим ваші розмови йдуть через релей, щоб прив’язаний телефон міг їх читати і відповідати. Туди потрапляє і те, що агент читає та пише: вихідники, шляхи до файлів, вивід команд.',
      second:
        'Прочитати це релей не може - вміст запечатано між цією IDE і вашим телефоном. Він бачить, коли ви на зв’язку і скільки даних іде повз, тобто приблизно ваші робочі години. Можна підняти свій релей.',
      can: 'Прив’язаний телефон може відповідати на дозволи, писати повідомлення і зупиняти хід.',
      cannot:
        'Він не може виконувати команди оболонки, ставити плагіни, міняти режим дозволів і чіпати буфер обміну цієї машини.',
      third:
        'Прив’язка підтверджується кодом, який показується на цьому екрані один раз. Звірка двох відбитків ловить те, чого код зловити не може: того, хто сфотографував екран і відсканував код першим.',
    },
  },

  feedback: {
    button: 'Повідомити про баг або надіслати ідею',
    kinds: {
      bug: { label: 'Баг', placeholder: 'Що сталося і чого ви чекали замість цього?' },
      idea: { label: 'Ідея', placeholder: 'Що панель могла б уміти?' },
      hello: { label: 'Привіт', placeholder: 'Будь-що - це дійде до людини, а не в чергу.' },
    },
    email: 'ПОШТА',
    emailOptional: 'необов’язково',
    attachments: 'ВКЛАДЕННЯ',
    addFiles: 'Додати файли',
    removeFile: (name) => `Прибрати: ${name}`,
    attachTotal: (count, max, size, budget) => `${count} з ${max} · ${size} з ${budget}`,
    logs: 'Додати налагоджувальні логи',
    logsFromTab: (tab) => `З вкладки ${tab} - `,
    logsFromOpenTab: 'З вкладки, відкритої зараз: ',
    logsWhat:
      'версії, таймінги і те, що пішло не так. Ні вашої розмови, ні імен файлів, ні шляхів - і все це можна прочитати цілком до відправлення.',
    logsOnlyBug: 'Тільки з багом: звіт - це розповідь про те, що зламалося, а тут йому нічого описувати.',
    seeWhat: 'Подивитися, що саме додасться',
    send: 'Надіслати',
    sending: 'Надсилаємо…',
    sentPartly: (note) => `Надіслано, але не все. ${note}`,
    sent: 'Надіслано. Дякую ❤️ - це прийде просто до мене.',
    notSent: 'Надіслати не вийшло. Нічого не втрачено - спробуйте ще раз.',
    reportNote: (tab) =>
      `Це вкладення цілком, слово в слово${tab ? `, для вкладки ${tab}` : ''}. Воно збирається тут, у вашій IDE, з того, що бачив сам плагін: версії, форма тієї розмови і все, що впало. Імена файлів ідуть короткими хешами, тож той самий файл читається як той самий, але який саме - не говориться.`,
    building: 'Збираємо…',
    copy: 'Скопіювати',
    problems: {
      empty: 'Напишіть спершу пару слів.',
      tooLong: (max) => `Це довше за ${max} символів.`,
      tooMany: (max) => `Не більше ${max} файлів.`,
      tooHeavy: (budget) => `Файли разом важчі за ${budget}.`,
    },
  },

  mcp: {
    empty: 'Сервери MCP не налаштовані.',
    addServer: 'ДОДАТИ СЕРВЕР',
    namePlaceholder: 'ім’я',
    commandPlaceholder: 'команда або URL для sse/http',
    refreshAll: 'Оновити всі',
    refreshing: 'Оновлюємо…',
    add: 'Додати',
    adding: 'Додаємо…',
    authenticate: 'Увійти',
    opening: 'Відкриваємо…',
    reconnect: 'Перепідключити',
    retry: 'Ще раз',
    reconnecting: 'Перепідключаємо…',
    remove: 'Видалити',
    removing: 'Видаляємо…',
    status: {
      connected: 'підключений',
      needsAuth: 'потрібен вхід',
      failed: 'помилка',
      pending: 'підключається…',
      disabled: 'вимкнений',
    },
  },

  plugins: {
    tabInstalled: 'Встановлені',
    tabBrowse: 'Каталог',
    tabMarkets: 'Маркети',
    emptyInstalled: 'Плагіни не встановлені.',
    searchPlaceholder: 'Шукати плагіни за іменем або описом…',
    noMarketplaces: 'Маркетплейси не підключені.',
    noMatches: 'Нічого не знайшлося.',
    emptyMarketplaces: 'Маркетплейси не налаштовані.',
    addMarketplace: 'ДОДАТИ МАРКЕТПЛЕЙС',
    marketplacePlaceholder: 'URL, шлях або owner/repo на GitHub',
    refresh: 'Оновити',
    refreshing: 'Оновлюємо…',
    install: 'Встановити',
    installing: 'Встановлюємо…',
    uninstall: 'Видалити',
    uninstalling: 'Видаляємо…',
    enable: 'Увімкнути',
    enabling: 'Вмикаємо…',
    disable: 'Вимкнути',
    disabling: 'Вимикаємо…',
    add: 'Додати',
    adding: 'Додаємо…',
    remove: 'Прибрати',
    removing: 'Прибираємо…',
  },

  mobile: {
    pair: 'Прив’язати',
    removeFromQueue: 'Прибрати з черги',
    newSessionTitle: 'нова розмова',

    sessions: {
      nothingYet: 'Поки що нічого показати. Відкрийте проєкт в IDE або прив’яжіть ще одну.',
      nonePaired: 'До цього телефона поки що не прив’язано жодної IDE. Натисніть «Прив’язати».',
      recentlyOpened: 'Нещодавно відкриті',
      projectClosed: 'Зараз не відкритий в IDE.',
      noConversations: 'Розмов поки що немає.',
      hidden: (n) => `приховано: ${n} · показати`,
      hide: 'Сховати',
      pastConversations: 'Минулі розмови',
      newChat: 'Новий чат',
      openAndStart: 'Відкрити й почати',
      waitingForYou: 'Чекають на вас',
      answer: 'Відповісти',
      countWaiting: (n) => `чекають: ${n}`,
      countOpen: (n) => `відкрито: ${n}`,
      kind: {
        permission: 'Дозвіл',
        question: 'Питання',
        plan: 'План',
        unknown: 'Чекає',
      },
      state: {
        crashed: 'зупинено - процес помер',
        waiting: 'чекає на вас',
        waitingPermission: 'чекає на вас · дозвіл',
        waitingQuestion: 'чекає на вас · питання',
        waitingPlan: 'чекає на вас · план',
        working: 'працює',
        done: 'готово',
      },
      reach: {
        connecting: 'Підключаємося…',
        asleep: 'З релеєм зв’язок є, але жодна IDE не відповідає.',
        silent: 'Уже кілька хвилин ніхто не відповідає. Машину вимкнено - або доступ цьому пристрою на ній відкликали.',
        revoked: 'Ця IDE більше не знає цей пристрій. Спаруйте заново або забудьте її.',
        elsewhere: 'Відкрито ще в одній вкладці або у встановленій програмі - з’єднання тримає саме та копія.',
        reconnecting: 'Перепідключаємося… список нижче може бути застарілим.',
        offline: 'До релею не достукатися. Нічого не втрачено - зв’язок повернеться сам.',
      },
      agent: {
        connecting: 'підключається…',
        asleep: 'не відповідає',
        silent: 'довго мовчить',
        revoked: 'доступ відкликано',
        elsewhere: 'відкрито в іншому місці',
        reconnecting: 'перепідключається…',
        offline: 'не в мережі',
      },
    },

    history: { title: 'Історія', empty: 'Минулих розмов у цьому проєкті поки що немає.' },

    decision: {
      planWaiting: 'Чекає план',
      questionOf: (n, total) => `Питання ${n} з ${total}`,
      nothingWaiting: 'Тут вас більше нічого не чекає.',
      openConversation: 'Відкрити розмову',
      allowOnce: 'Дозволити один раз',
      deny: 'Відмовити',
    },

    thread: {
      loading: 'Завантажуємо розмову…',
      waitingPerm: 'Потрібен дозвіл - відповідайте',
      waitingAsk: 'Чекає питання - відповідайте',
      waitingPlan: 'Чекає план - вирішуйте',
      stopAgent: (what) => `Зупинити ${what}?`,
    },

    drawer: {
      menu: 'Меню',
      projects: 'Проєкти',
      tasks: 'Задачі й агенти',
      mcp: 'MCP-сервери',
      plugins: 'Плагіни',
      accounts: 'Акаунти Claude',
      pair: 'Прив’язати IDE',
      forget: 'Забути',
      waiting: (n) => `чекають: ${n}`,
      live: (n) => `живих: ${n}`,
      sealed: 'Запечатано між вашою IDE та цим телефоном.',
    },

    scenarios: {
      running: 'ЗАРАЗ ІДЕ',
      repository: 'Репозиторій',
      inRepository: (name: string): string => `У ${name}`,
      opensProject: 'Зараз не відкритий в IDE - вибір відкриє його там',
      nothingRunning: 'Зараз у цьому проєкті нічого не йде.',
      none: 'У цьому проєкті не записано жодного кола робіт.',
      create: 'Новий',
      row: {
        runNow: 'Запустити зараз',
        asksFirst: (names: string): string => `спитає ${names}`,
        schedule: 'Запланувати запуск',
        scheduled: (n: number): string => `${n} стоїть`,
        editor: 'Відкрити редактор',
        duplicate: 'Скопіювати',
        delete: 'Видалити цей сценарій',
      },
      start: {
        title: 'Запустити зараз',
        required: 'обовʼязково',
        beside: (n: number): string =>
          n === 1
            ? 'Почнеться другий прогін поряд із тим, що вже йде. Обидва працюють по одній робочій копії.'
            : `Почнеться прогін поряд із ${n}, що вже йдуть. Усі працюють по одній робочій копії.`,
        run: 'Запустити',
      },
      editor: {
        tidy: (n: number): string => `${n} на прибирання`,
        tooBig: 'Цей сценарій завеликий, щоб відкрити його звідси. Його можна поправити за столом.',
        card: (stage: number, at: number, total: number): string => `етап ${stage} · картка ${at} з ${total}`,
        done: 'Готово',
      },
      step: {
        told: 'ЩО ЙОМУ СКАЗАЛИ',
        verdict: 'ВЕРДИКТ',
        of: (at: number, took: string): string => `крок ${at} · ${took}`,
      },
    },

    tabs: {
      title: 'Розмови',
      fork: 'Форк цієї розмови',
      note: 'Форк лишається у своїй групі: смуга кольору й відступ кажуть, з якої розмови він виріс. Порядок вкладок міняється за столом.',
    },

    tasks: {
      title: 'Задачі й агенти',
      label: 'Список задач',
      doneOf: (done, total) => `${done} з ${total} готово`,
      running: 'ТРИВАЄ',
      agents: 'Агенти',
      agent: 'Субагент',
      background: 'Фонові',
      nothing: 'У цій розмові нічого не виконується.',
      agentGone: 'Цього агента більше немає в розмові на екрані.',
    },

    run: {
      title: 'Як іде цей хід',
      subtitle: 'лише для цієї розмови',
      apply: 'Застосувати',
      locked: 'заблоковано',
      inForce: 'діє зараз',
      modeNote: 'Цю розмову почали за столом, і перед нею може хтось сидіти - тому її режим дозволів звідси не змінюється. Розмова, почата з телефона, стартує в будь-якому режимі на ваш вибір.',
    },

    message: {
      title: 'Це повідомлення',
      quote: 'Процитувати в наступному повідомленні',
      fork: 'Форк звідси',
      forkHint: 'Нова розмова з усім, що було до цього місця.',
      copy: 'Скопіювати',
      pin: 'Закріпити над стрічкою',
      unpin: 'Відкріпити',
      pinsFull: 'Три вже закріплені - спершу відкріпіть одне.',
    },

    mcp: {
      addServer: 'Додати сервер',
      atDesk: 'За столом',
      continueSignIn: 'Продовжити на claude.ai',
      removeAsk: (name) => `Видалити ${name}? Розмова перезапуститься, щоб це підхопити, і все, що в ній іде, зупиниться.`,
      restartNote: 'Сервер читається при запуску, тож розмова перезапуститься - усе, що в ній іде, зупиниться.',
      deskNote:
        'Конектор claude.ai авторизується на самому claude.ai, і це можна закінчити звідси. Вхід у будь-який інший сервер закінчується в браузері на машині з IDE - він лишається за столом.',
    },

    plugins: {
      tabs: {
        installed: 'Установлені',
        browse: 'Каталог',
        markets: 'Джерела',
      },
      readOnly: 'Установлення плагіна й вимкнення лишаються за столом - вони запускають чужий код на тій машині. Тут видно, які скіли й команди розмова насправді має.',
      noneInstalled: 'Плагінів не встановлено.',
      nothingFound: 'Нічого не знайдено.',
      noMarkets: 'Джерела не підключені.',
      search: 'Пошук у каталозі',
      on: 'увімк',
      off: 'вимк',
      trimmed: 'Каталог обрізано до того, що вміщається в одне повідомлення - решта за столом.',
    },

    accounts: {
      subtitle: 'яка підписка платить за роботу',
      paying: 'Платить за цю розмову',
      none: 'Лише той вхід, який Claude Code уже мав.',
      switchAsk: (name) => `Працювати далі на ${name}? Усі відкриті розмови на тій машині переїдуть на нього, а хід, що триває, буде перервано.`,
      switchNote: 'Перемикання переводить усі відкриті розмови на тій машині на новий акаунт і перериває хід, що триває.',
      addNote: 'Додавання акаунта й авторизація Claude Design лишаються за столом: і те, і те відкриває термінал і вхід через браузер на тій машині.',
      forgetAsk: (name) => `Забути ${name}? Його ключ приберуть з тієї машини - сам акаунт не зачеплено, повторний вхід усе поверне.`,
      logoutAsk: 'Вийти з Claude Code? Це відкличе ключ на боці Anthropic - ви розлогінитеся на всіх своїх машинах.',
    },

    newSession: {
      title: 'Нова розмова',
      asConfigured: 'Як налаштовано',
      asConfiguredSub: 'Як Claude Code налаштований на тій машині.',
      model: 'Модель',
      effort: 'Зусилля',
      mode: 'Режим',
      closedProject: 'Проєкт закритий - IDE відкриє його перед стартом.',
      start: 'Почати',
      opening: 'Відкриваємо проєкт…',
    },

    pairing: {
      title: 'Прив’язка до IDE',
      fromCode:
        'Прив’язуємося до IDE, що показала цей код. Зараз вона питає дозволу в того, хто за машиною.',
      how: 'В IDE відкрийте меню панелі → Віддалений доступ → Прив’язати пристрій. Відскануйте код камерою або введіть його нижче.',
      fingerprintAsk: 'IDE показує відбиток. Дозволяйте, тільки якщо там написано:',
      fingerprintNote:
        'Далі IDE попросить підтвердити і покаже відбиток. Ця програма покаже такий самий - дозволяйте, тільки якщо вони збіглися.',
      waiting: 'Чекаємо IDE…',
      done: 'Прив’язано.',
      failed: 'Прив’язатися не вийшло.',
      notACode: 'Це не схоже на код прив’язки.',
      iphone: 'iPhone',
      ipad: 'iPad',
      android: 'Телефон на Android',
      browser: 'Браузер',
    },

    composer: {
      commands: 'Команди',
      closeList: 'Закрити список',
      usageLimits: 'Ліміти',
      removeImage: (name) => `Прибрати: ${name}`,
      say: 'Напишіть щось…',
      reconnecting: 'Перепідключаємося…',
      slash: 'Слеш-команди',
      attachPhoto: 'Прикріпити фото',
      voice: 'Диктувати',
      voiceStop: 'Завершити диктування',
      stop: 'Стоп',
      send: 'Надіслати',
      queue: 'У чергу',
      running: 'триває',
      queued: (n) => `у черзі: ${n}`,
      dropQuote: 'Прибрати цитату',
      whatTravels: 'Що ходить між вашою IDE і цим телефоном',
      projectFiles: 'Файли проєкту',
      ofTotal: (shown, total) => `${shown} з ${total}`,
      photosDropped: (n) => `Ще ${n} не влізло в одне повідомлення - надішліть спершу ці.`,
      photoTooBig: 'В одне повідомлення це не влізе. Спробуйте по одній світлині.',
    },

    limits: {
      title: 'Ліміти і контекст',
      fiveHourWindow: 'П’ятигодинне вікно',
      weeklyWindow: 'Тижневе вікно',
      paceNote: (percent) =>
        `Тьмяна дуга - рівна витрата: ${percent}% тижня на сьогодні вже «належить». Поки яскрава дуга коротша за неї, тиждень іде за планом.`,
      context: 'Контекст цієї розмови',
      ofTotal: (used, total) => `${used} з ${total}`,
      spentToday: 'Витрачено сьогодні',
      acrossProjects: 'по всіх проєктах',
      noWindows: 'IDE ще не повідомила вікна підписки.',
      extraUsage: 'Оплата понад план',
      extraUsed: (window) =>
        `${window ? `ліміт «${window}»` : 'ліміт'} вичерпано, робота оплачується поверх підписки`,
      resetUnknown: 'час скидання поки що невідомий',
      resetsIn: (left) => `скинеться через ${left}`,
    },
  },

  status: {
    todayTokens: 'Токени за сьогодні, по всіх проєктах',
    openPr: 'Відкрити pull request у браузері',
    noPr: 'без PR',
    effortHint: (effort) => `Зусилля на міркування: ${effort}`,
    modelHint: (model) => `Модель: ${model}`,
    modelHintSwitched: (model, from) => `Модель: ${model} - Claude Code перейшов на неї сам, з ${from}`,
    modelHintStuck: (model, picked) => `Модель: ${model} - обрали ${picked}, але вибір не спрацював`,
    modeHint: (mode) => `Режим дозволів: ${mode}`,
    sessionLimit: 'П’ятигодинний ліміт',
    weekLimit: 'Тижневий ліміт',
    windowUsed: (title, percent) => `${title}: витрачено ${percent}%`,
    resetsIn: (left) => `Скинеться через ${left}`,
    paceBudget: (percent) => `Тьмяне кільце: ${percent}% - рівна витрата на сьогодні`,
    extraUsage: (limit) => `Оплата понад план: ${limit} вичерпано, робота оплачується поверх підписки`,
    extraSpent: (percent) => `Витрачено ${percent}% місячного бюджету на оплату понад план`,
    limitNamed: (window) => `ліміт «${window}»`,
    limitUnnamed: 'ліміт',
  },

  limits: {
    fiveHour: 'п’ятигодинний',
    weekly: 'тижневий',
    weeklyOpus: 'тижневий на Opus',
    weeklySonnet: 'тижневий на Sonnet',
    weeklyApps: 'тижневий на застосунки',
    weeklyWithExtra: 'тижневий разом з оплатою понад план',
    extra: 'оплата понад план',
  },

  permission: {
    label: 'ДОЗВІЛ',
    decisions: { once: 'Дозволити раз', always: 'Завжди дозволяти', deny: 'Відмовити' },
    underMode: (mode) => `Режим: ${mode}`,
  },

  selectors: {
    model: 'МОДЕЛЬ',
    effort: 'ЗУСИЛЛЯ',
    mode: 'РЕЖИМ',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'відкрити минулу розмову цього проєкту',
    fork: 'продовжити цю розмову в новій вкладці',
    login: 'увійти в Claude Code через термінал IDE',
    logout: 'вийти - відкриється термінал IDE',
    designLogin: 'авторизувати Claude Design у терміналі IDE',
    model: 'змінити модель для цієї сесії',
    effort: 'задати, скільки Claude думає перед дією',
    context: 'чим зайняте вікно контексту просто зараз',
    cost: 'витрати і вікна ліміту цієї сесії',
    usage: 'вікна підписки і коли вони скидаються',
    codeReview: 'зробити рев’ю pull request',
  },
}
