import { LOCALES, nativeName, resolveLocale, useT, type Locale } from '../i18n'
import { ChoiceList } from './Choices'
import type { MenuOption } from './Menu'

interface LanguageProps {
  /** The explicit choice. Empty means the first entry - whatever the IDE speaks. */
  chosen: string
  /** What the IDE itself is set to, so the first entry can say which language that is. */
  ide: string
  onPick: (language: string) => void
}

/**
 * Which language the panel speaks.
 *
 * Two things about this list are the whole design of the screen.
 *
 * Every language is written in itself - "Русский", "简体中文" - with its English name underneath. Nobody
 * needs that while everything is fine; the person who needs it is the one who landed in a language they
 * cannot read, and "Chinese" spelled in Chinese is unreadable to exactly them.
 *
 * And the first entry is not English but "whatever the IDE speaks", which is also what a panel nobody has
 * touched already does. Defaulting to English would mean somebody working in a Chinese IDE has to find
 * out that this screen exists before the panel says a word they can read - which is the complaint this
 * was built for in the first place.
 */
export const Language = ({ chosen, ide, onPick }: LanguageProps) => {
  const t = useT()

  const options: MenuOption[] = [
    {
      id: AUTOMATIC,
      label: t.language.followIde,
      // The IDE's language, named in itself as the rows below are: the promise is "this one", and it has
      // to be legible to whoever the promise is for. Unknown only before the shell's first message.
      sub: ide ? t.language.followIdeSub(nativeName(resolveLocale(ide))) : t.language.followIdeUnknown,
    },
    ...LOCALES.map((locale) => ({ id: locale.id, label: locale.native, sub: locale.english })),
  ]

  return (
    <ChoiceList
      options={options}
      // An explicit choice is kept as it was chosen; anything else is the automatic entry. A saved tag we
      // no longer have a dictionary for lands here rather than on a row that would tick nothing.
      selected={selectedIn(chosen)}
      note={t.language.note}
      onPick={(id) => onPick(id === AUTOMATIC ? '' : id)}
    />
  )
}

/** The identifier of the "follow the IDE" entry. Empty is what the setting stores; a list needs a key. */
const AUTOMATIC = 'auto'

const selectedIn = (chosen: string): string => {
  if (!chosen) return AUTOMATIC
  return LOCALES.some((locale) => locale.id === (chosen as Locale)) ? chosen : AUTOMATIC
}
