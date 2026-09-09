# Amazing Claude Code GUI

**Claude Code als Chat-Panel in deiner JetBrains-IDE.** Karten statt Terminal-Rücklauf, Dateien,
auf die du zeigst, statt Pfaden, die du tippst - und dein Code direkt daneben.

Es steuert die Claude-Code-CLI, die ohnehin auf deinem Rechner liegt: Konto, Modelle,
Slash-Befehle, Berechtigungsregeln, MCP-Server und Skills kommen unverändert mit. Kein Proxy
dazwischen, kein Konto bei uns.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Українська](uk.md) | [Español](es.md) | [Português (Brasil)](pt.md) | **Deutsch** | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Warum dieses hier

- **Eine Arbeitsrunde, einmal geschrieben und für dich ausgeführt.** Szenarien: ein paar Karten,
  jede eine eigene Claude-Sitzung - implementieren, überprüfen, beheben, die Tests laufen lassen -
  in Etappen, die sich mehr als einmal wiederholen können, mit einem Hauptstrang, der sie durchläuft
  und bewertet, was jede gefunden hat. Starte per Taste, drei gleichzeitig gegen drei Tickets, oder
  per Uhrzeit, jeden Wochentag um neun, mit im Voraus beantworteten Fragen. Beschreibe die Runde in
  einem Satz, und Claude liest das Projekt und erstellt das Szenario.
- **Das ganze Panel von deinem Handy aus, nicht nur eine "Ja"-Taste.** Beantworte eine
  Berechtigungsanfrage oder einen Plan, öffne ein geschlossenes Projekt, lies das gestrige Gespräch,
  verzweige, ändere das Modell und den Aufwand, wechsle das Konto, melde dich bei einem Connector
  an, diktiere, verfolge einen laufenden Szenario-Lauf und gib ihn frei. Standardmäßig aus, per
  QR-Code gekoppelt, Ende-zu-Ende verschlüsselt über ein Relay, das kein Wort mitlesen kann, mit
  einem Tipp widerrufbar.
- **Mehrere Claude-Konten, mit einem Klick gewechselt.** Arbeit und Privates auf einem Rechner, ohne
  dich von einem der beiden abzumelden. Jede Zeile zeigt, was von dessen Fünf-Stunden-Fenster und
  seiner Woche übrig ist, und Select verschiebt jedes offene Gespräch darauf.
- **Suche über jedes Gespräch des Projekts.** Präfixe, Tippfehler, Wortstämme, Phrasen in
  Anführungszeichen; dieses Gespräch oder alle, mit einem Sprung direkt zur Nachricht in ihrem
  Gespräch. Wenn Worte nicht reichen, beschreibe, wonach du suchst, und Claude liest die Gespräche
  für dich.
- **Alles, was es tut, steht auf dem Bildschirm.** Jeder Werkzeugaufruf mit seiner Dauer, jede
  Änderung als offener Diff, Subagenten und ganze Flotten von Workflow-Agenten, bei denen das
  Transkript jedes einzelnen Agenten einen Klick entfernt ist, die Aufgabenliste, die abgehakt wird,
  und was der Zug gekostet hat. Eine überlastete oder ratenbegrenzte API ist eine Karte mit dem
  Grund und dem Countdown, kein Schweigen.
- **Niemand antwortet für dich, und nichts geht verloren.** Eine Berechtigungsanfrage, ein Plan oder
  eine Frage warten, so lange es dauert - kein Timeout, kein automatisches Weitermachen. Gespräche
  laufen weiter, auch wenn das Panel eingeklappt oder das Projekt gewechselt wird, und Nachrichten,
  die während eines Zuges geschrieben werden, warten in einer Warteschlange, die die IDE führt.
- **Android Studio inklusive**, dazu jede JetBrains-IDE ab 2026.1.

## Erste Schritte

1. Claude Code installieren und im Terminal zum Laufen bringen - genau diese CLI steuert das
   Panel.
2. Das Panel über die Taste in der Seitenleiste öffnen. Bist du noch nicht angemeldet, erledigt
   das eine Taste im Terminal der IDE.
3. Nachricht schreiben: Dateien oder Ordner ins Feld ziehen, `@` für eine Projektdatei, `/` für
   einen Befehl, `!` um etwas in deiner Shell auszuführen.
4. Im Editor etwas markieren und "Send to Amazing Claude Code GUI" wählen - unterwegs ist dann
   eine genaue Datei- und Zeilenangabe statt eingefügten Textes.
5. Modell, Aufwand und Berechtigungsmodus sind die drei Tasten unter dem Feld, und jede gehört zu
   dem Tab, den du gerade ansiehst.

## Außerdem im Panel

- **Auf Dateien zeigen statt sie tippen.** Zieh eine hinein, tippe `@`, um sie auszuwählen, füge
  einen Screenshot oder ein langes Log ein - jede landet als Chip, bei dem man sich nicht vertippen
  kann.
- **Code geht mit seiner Adresse raus.** Markiere die Zeilen, "Send to Amazing Claude Code GUI" -
  und der Agent liest die echte Datei ringsum statt eines Schnipsels ohne Zusammenhang.
- **Pfade öffnen Dateien.** Ein Pfad an beliebiger Stelle im Gespräch - im Kopf einer Karte, einer
  Antwort, einem Fehler, deiner eigenen Nachricht - öffnet die Datei im Editor an der Zeile, die er
  nennt; eine Änderung öffnet sich direkt bei der Änderung selbst.
- **Jeder Teil einer Antwort ist ein Griff.** Zitiere ihn in deine nächste Nachricht, verzweige das
  Gespräch genau ab dieser Stelle, hefte bis zu drei Nachrichten über dem Gespräch an, oder hol eine
  gesendete Nachricht zurück ins Feld, um sie zu korrigieren und erneut zu senden.
- **Modell, Aufwand und Modus wechseln mitten im Gespräch**, je Tab und ohne irgendetwas neu zu
  starten. Womit ein neues Gespräch beginnt, legst du selbst fest, und ein Modell deines eigenen
  Servers lässt sich von Hand hinzufügen.
- **MCP-Server, Plugins und Marketplaces** haben eigene Ansichten: welcher Server läuft, welcher
  eine Anmeldung will, welcher abgestürzt ist und warum.
- **Verlauf** der bisherigen Gespräche dieses Projekts, auch der im Terminal begonnenen, vom Ende
  her geöffnet und bei Bedarf seitenweise weiter zurückgeladen.
- **Eine Warteschlange** für Nachrichten, die während eines Zuges entstehen, per Ziehen sortierbar.
- **`!` führt einen Befehl in deiner eigenen Shell aus**, und die Ausgabe reist mit deiner nächsten
  Nachricht mit, ohne einen Zug oder eine Berechtigungsanfrage zu kosten.
- **Prompt verbessern** - der Funke schreibt deinen Entwurf in einem eigenen Lauf um, ohne Kontext
  des Gesprächs zu kosten, und eine Taste holt deine eigenen Worte zurück.
- **Spracheingabe** mit deinem eigenen Deepgram-Schlüssel: einen Hotkey halten, auch aus dem Editor
  heraus.
- **Klangsignale** für die sieben Momente, die einen verdienen - und nur, wenn du nicht ohnehin
  hinsiehst.
- **Statistiken** zu Stunden, Gewohnheiten und Errungenschaften, als Bild teilbar.
- **Zehn Sprachen**, standardmäßig der IDE folgend.
- **Deine ungespeicherten Puffer** werden vor einem Zug geschrieben, und Dateien, die der Agent
  geändert hat, liest die IDE sofort neu ein.
- **Ein Seitenpanel, kein Editor-Tab**, an jedem Rand des Fensters; Zahlen wählen eine Option aus,
  Shift+Tab schaltet den Modus durch, Escape stoppt den Zug.

## Datenschutz und Transparenz

- **Alles läuft auf deinem Rechner.** Kein Proxy, kein Server von uns dazwischen. Deine
  Claude-Anmeldung gehört der CLI: Das Plugin liest sie nie und sucht auch keine API-Schlüssel auf
  deiner Platte.
- **Keine Telemetrie, keine Analytik, kein Konto.** Bei ausgeschaltetem Fernzugriff verlässt nur
  ein Fehlerbericht die Maschine, den du selbst schreibst und abschickst - und eine Taste zeigt
  vorher seinen genauen Text.
- **Deine Berechtigungsregeln bleiben deine.** Worüber gefragt wird, entscheidet die CLI mit
  deinen Einstellungen, Regeln und Hooks. Das Plugin fügt keinen eigenen Hook hinzu und startet
  nie eine Sitzung in einem laxeren Modus als dem auf dem Bildschirm.
- **Quellcode einsehbar** auf GitHub unter der Elastic License 2.0, und die
  [Datenschutzerklärung](https://relay.mzpizote.com/privacy) führt alles auf, was den Rechner
  verlassen kann.

## Voraussetzungen

Installiertes und angemeldetes Claude Code sowie eine beliebige JetBrains-IDE ab 2026.1, Android
Studio eingeschlossen. Android Studio bringt keinen eigenen eingebetteten Browser mit, deshalb
bietet die IDE an, das Browser-Plugin von JetBrains zusammen mit diesem zu installieren.

## Links

- [Quellcode](https://github.com/crmapache/amazing-claude-code)
- [Fehler melden oder Funktion wünschen](https://github.com/crmapache/amazing-claude-code/issues),
  oder das Formular direkt im Panel benutzen
- [Datenschutzerklärung](https://relay.mzpizote.com/privacy)
