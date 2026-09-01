package io.github.crmapache.amazingclaudecode.remote

import io.github.crmapache.amazingclaudecode.claude.IdeLanguage

/**
 * What a push notification says, in the language the panel speaks.
 *
 * The panel's own words live in `webview/src/i18n`, and these do not: a notification is written while
 * nothing of the panel is running - the phone is asleep, that is the entire point of it - and the text is
 * sealed on this side before it reaches the relay (see NotificationReasons). So the seven lines below are
 * the one place where the plugin has words of its own, and the list of languages is the same list.
 *
 * Short because a lock screen is short, and specific because "something happened" is worth less than
 * nothing: the whole value of a notification is knowing whether to reach for the phone.
 */
internal object PushWords {

    fun permission(language: String, target: String): String = when (language) {
        "zh-Hans" -> if (target.isEmpty()) "正在等待授权" else "授权：$target"
        "ru" -> if (target.isEmpty()) "Ждёт разрешения" else "Разрешение: $target"
        "uk" -> if (target.isEmpty()) "Чекає дозволу" else "Дозвіл: $target"
        "es" -> if (target.isEmpty()) "Esperando un permiso" else "Permiso: $target"
        "pt-BR" -> if (target.isEmpty()) "Esperando uma permissão" else "Permissão: $target"
        "de" -> if (target.isEmpty()) "Wartet auf eine Berechtigung" else "Berechtigung: $target"
        "fr" -> if (target.isEmpty()) "En attente d'une autorisation" else "Autorisation : $target"
        "ja" -> if (target.isEmpty()) "権限の確認を待っています" else "権限：$target"
        "ko" -> if (target.isEmpty()) "권한을 기다리는 중" else "권한: $target"
        else -> if (target.isEmpty()) "Waiting for a permission" else "Permission: $target"
    }

    fun question(language: String): String = when (language) {
        "zh-Hans" -> "Claude 有事情要问你"
        "ru" -> "Claude о чём-то спрашивает"
        "uk" -> "Claude щось питає"
        "es" -> "Claude te está preguntando algo"
        "pt-BR" -> "O Claude está perguntando uma coisa"
        "de" -> "Claude fragt dich etwas"
        "fr" -> "Claude te demande quelque chose"
        "ja" -> "Claude が質問しています"
        "ko" -> "Claude가 무언가 묻고 있어요"
        else -> "Claude is asking you something"
    }

    fun plan(language: String): String = when (language) {
        "zh-Hans" -> "计划已经准备好了"
        "ru" -> "План готов - ждёт вас"
        "uk" -> "План готовий - чекає на вас"
        "es" -> "Hay un plan listo para ti"
        "pt-BR" -> "Tem um plano pronto para você"
        "de" -> "Ein Plan wartet auf dich"
        "fr" -> "Un plan est prêt pour toi"
        "ja" -> "計画ができました"
        "ko" -> "계획이 준비됐어요"
        else -> "A plan is ready for you"
    }

    fun rateLimit(language: String): String = when (language) {
        "zh-Hans" -> "你已经用满了额度"
        "ru" -> "Вы упёрлись в лимит"
        "uk" -> "Ви вперлися в ліміт"
        "es" -> "Has llegado al límite"
        "pt-BR" -> "Você bateu no limite"
        "de" -> "Du hast ein Limit erreicht"
        "fr" -> "Tu as atteint une limite"
        "ja" -> "上限に達しました"
        "ko" -> "한도에 도달했어요"
        else -> "You have hit a limit"
    }

    fun extraUsage(language: String): String = when (language) {
        "zh-Hans" -> "套餐已用完 - 之后的工作开始计费"
        "ru" -> "План исчерпан - работа пошла за деньги"
        "uk" -> "План вичерпано - робота пішла за гроші"
        "es" -> "El plan se ha agotado - a partir de ahora se factura"
        "pt-BR" -> "O plano acabou - daqui em diante é cobrado"
        "de" -> "Das Kontingent ist aufgebraucht - ab jetzt wird abgerechnet"
        "fr" -> "Le forfait est épuisé - le travail est maintenant facturé"
        "ja" -> "プランを使い切りました - ここからは課金されます"
        "ko" -> "요금제를 다 썼어요 - 이후로는 청구돼요"
        else -> "The plan is used up - the work is now billed"
    }

    fun trouble(language: String, project: String): String = when (language) {
        "zh-Hans" -> "$project 出问题了"
        "ru" -> "В проекте $project что-то сломалось"
        "uk" -> "У проєкті $project щось зламалося"
        "es" -> "Algo se ha roto en $project"
        "pt-BR" -> "Algo quebrou em $project"
        "de" -> "In $project ist etwas kaputtgegangen"
        "fr" -> "Quelque chose a cassé dans $project"
        "ja" -> "$project で何かが壊れました"
        "ko" -> "${project}에서 무언가 고장났어요"
        else -> "Something broke in $project"
    }

    fun turnFinished(language: String): String = when (language) {
        "zh-Hans" -> "这一回合结束了"
        "ru" -> "Ход закончен"
        "uk" -> "Хід завершено"
        "es" -> "El turno ha terminado"
        "pt-BR" -> "O turno terminou"
        "de" -> "Der Durchgang ist fertig"
        "fr" -> "Le tour est terminé"
        "ja" -> "ターンが終わりました"
        "ko" -> "턴이 끝났어요"
        else -> "The turn is finished"
    }

    /** Every language these words exist in - the same ones the panel has dictionaries for. */
    val LANGUAGES: List<String> get() = IdeLanguage.SUPPORTED
}
