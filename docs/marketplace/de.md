# Amazing Claude Code GUI

**Claude Code als Chat-Panel in deiner JetBrains-IDE.** Karten statt Terminal-Rücklauf, Dateien,
auf die du zeigst, statt Pfaden, die du tippst - und dein Code direkt daneben.

Es steuert die Claude-Code-CLI, die ohnehin auf deinem Rechner liegt: Konto, Modelle,
Slash-Befehle, Berechtigungsregeln, MCP-Server und Skills kommen unverändert mit. Kein Proxy
dazwischen, kein Konto bei uns.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Español](es.md) | [Português (Brasil)](pt.md) | **Deutsch** | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Warum dieses hier

- **Auf Dateien zeigen statt sie tippen.** Zieh eine hinein, tippe `@` und wähle sie aus, füge
  einen Screenshot ein - jede landet als Chip, bei dem man sich nicht vertippen kann.
- **Code geht mit seiner Adresse raus.** Markiere die Zeilen, "Send to Amazing Claude Code GUI" -
  und der Agent liest die echte Datei ringsum statt eines Schnipsels ohne Zusammenhang.
- **Jeder Teil einer Antwort ist ein Griff.** Zitiere ihn in deine nächste Nachricht oder
  verzweige das Gespräch genau an dieser Stelle: das Original bleibt, wie es war.
- **Du siehst, was läuft.** Werkzeugaufrufe mit Dauer, Diffs mit Zahlen, die Aufgabenliste, die
  abgehakt wird, Pläne, Subagenten, ganze Flotten von Agenten in einem einzigen Workflow-Aufruf -
  und was der Zug gekostet hat.
- **Kein unerklärliches Schweigen.** Ist die API überlastet oder das Limit erreicht, erscheint
  eine Karte: Grund, Versuch und Countdown bis zum nächsten.
- **Niemand antwortet für dich.** Eine Berechtigungsanfrage, ein Plan oder eine Frage warten, so
  lange es dauert - kein Timeout, kein automatisches Weitermachen.
- **Ein Seitenpanel, kein Editor-Tab**, an jedem Rand des Fensters.
- **Gespräche überleben das Panel.** Einklappen, Projekt wechseln, zurückkommen: der Agent hat
  weitergearbeitet, und die eingereihten Nachrichten stehen noch in der Reihe.
- **Modell, Aufwand und Modus wechseln mitten im Gespräch**, je Tab und ohne Neustart.
- **Antworte vom Handy aus.** Standardmäßig aus, Kopplung per QR-Code, Ende-zu-Ende verschlüsselt,
  mit einem Tipp widerrufbar.
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

- **Verlauf** der bisherigen Gespräche dieses Projekts, auch der im Terminal begonnenen.
- **Eine Warteschlange** für Nachrichten, die während eines Zuges entstehen, per Ziehen sortierbar.
- **Prompt verbessern**: Der Funke schreibt deinen Entwurf in einem eigenen Lauf um, ohne Kontext
  des Gesprächs zu kosten, und eine Taste holt deine eigenen Worte zurück.
- **Spracheingabe** mit deinem eigenen Deepgram-Schlüssel: Taste halten, auch aus dem Editor
  heraus.
- **Klangsignale** für die sieben Momente, die einen verdienen - und nur, wenn du nicht ohnehin
  hinsiehst.
- **Statistiken** zu Stunden, Gewohnheiten und Errungenschaften, als Bild teilbar.
- **Neun Sprachen**, standardmäßig der IDE folgend.
- **Ungespeicherte Puffer** werden vor einem Zug geschrieben, und Dateien, die der Agent geändert
  hat, liest die IDE sofort neu ein.

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
