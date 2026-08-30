# Amazing Claude Code GUI

**Claude Code sous forme de panneau de discussion dans votre IDE JetBrains.** Des cartes plutôt
que le défilement du terminal, des fichiers que l'on désigne plutôt que des chemins que l'on
tape - et votre code juste à côté.

Il pilote le CLI Claude Code déjà installé sur votre machine : votre compte, les modèles, les
commandes en barre oblique, les règles de permissions, les serveurs MCP et les skills arrivent
avec lui. Pas de proxy au milieu, aucun compte chez nous.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Español](es.md) | [Português (Brasil)](pt.md) | [Deutsch](de.md) | **Français** | [日本語](ja.md) | [한국어](ko.md)

## Pourquoi celui-ci

- **On désigne les fichiers, on ne les tape pas.** Glissez-en un, tapez `@` pour le choisir,
  collez une capture d'écran : chacun arrive sous forme de pastille où l'on ne peut pas se
  tromper.
- **Le code part avec son adresse.** Sélectionnez les lignes, « Send to Amazing Claude Code GUI »,
  et l'agent lit le vrai fichier autour d'elles au lieu d'un extrait sans contexte.
- **N'importe quel morceau d'une réponse est une poignée.** Citez-le dans votre message suivant,
  ou faites bifurquer la conversation exactement à cet endroit : l'originale reste telle quelle.
- **On voit ce qui se passe.** Les appels d'outils avec leur durée, les diffs avec leurs chiffres,
  la liste de tâches qui se coche, les plans, les sous-agents, des flottes entières d'agents dans
  un seul appel de workflow, et ce qu'a coûté le tour.
- **Aucun silence inexpliqué.** Une API surchargée ou limitée devient une carte : la raison, le
  numéro de tentative et le compte à rebours.
- **Personne ne répond à votre place.** Une demande de permission, un plan ou une question
  attendent le temps qu'il faut - pas de délai, pas de reprise automatique.
- **Un panneau latéral, pas un onglet d'éditeur**, sur n'importe quel bord de la fenêtre.
- **Les conversations survivent au panneau.** Repliez-le, changez de projet, revenez : l'agent a
  continué de travailler, et les messages en file y sont toujours.
- **Modèle, effort et mode changent en cours de conversation**, onglet par onglet, sans rien
  redémarrer.
- **Répondez depuis votre téléphone.** Désactivé par défaut, appairage par QR code, chiffrement de
  bout en bout, révocable d'une pression.
- **Android Studio compris**, comme tous les IDE JetBrains à partir de 2026.1.

## Pour commencer

1. Avoir Claude Code installé et fonctionnel dans un terminal.
2. Ouvrir le panneau depuis la barre latérale ; si vous n'êtes pas connecté, un bouton s'en charge
   dans le terminal de l'IDE.
3. Écrire : déposez des fichiers dans le champ, `@` pour un fichier, `/` pour une commande, `!`
   pour lancer quelque chose dans votre shell. Modèle, effort et mode sont les trois boutons sous
   le champ.

## Également dans le panneau

- **L'historique** des conversations passées de ce projet, y compris celles commencées au
  terminal.
- **Une file d'attente** pour les messages écrits pendant un tour, réordonnable par glisser.
- **Améliorer le prompt** : l'étoile réécrit votre brouillon dans une exécution à part, sans
  consommer le contexte de la conversation, et un bouton vous rend vos propres mots.
- **La dictée vocale** avec votre propre clé Deepgram : maintenez un raccourci, même depuis
  l'éditeur.
- **Les alertes sonores** pour les sept moments qui le méritent, et seulement quand vous ne
  regardez pas déjà.
- **Des statistiques** d'heures, d'habitudes et de succès, partageables en image.
- **Neuf langues**, celle de votre IDE par défaut.
- **Vos tampons non enregistrés** sont écrits avant un tour, et les fichiers modifiés par l'agent
  sont relus aussitôt par l'IDE.

## Confidentialité et transparence

- **Tout tourne sur votre machine.** Pas de proxy, aucun serveur à nous au milieu. Votre connexion
  Claude appartient au CLI : le plugin ne la lit jamais et ne part pas chercher de clés d'API sur
  votre disque.
- **Ni télémétrie, ni analytique, ni compte.** L'accès distant désactivé, la seule chose qui
  quitte la machine est un rapport d'anomalie que vous écrivez et envoyez vous-même - et un bouton
  vous en montre d'abord le texte exact.
- **Vos règles de permissions restent les vôtres.** Ce qui mérite une question, c'est le CLI qui
  en décide, avec vos réglages, vos règles et vos hooks. Le plugin n'ajoute aucun hook à lui et ne
  démarre jamais une session dans un mode plus permissif que celui affiché.
- **Sources disponibles** sur GitHub sous licence Elastic 2.0, et la
  [politique de confidentialité](https://relay.mzpizote.com/privacy) énumère tout ce qui peut
  quitter la machine.

## Prérequis

Claude Code installé et connecté, et n'importe quel IDE JetBrains à partir de 2026.1, Android
Studio compris. Android Studio n'embarque pas de navigateur intégré, l'IDE propose donc
d'installer celui de JetBrains en même temps que ce plugin.

## Liens

- [Code source](https://github.com/crmapache/amazing-claude-code)
- [Signaler un bogue ou demander une fonctionnalité](https://github.com/crmapache/amazing-claude-code/issues),
  ou utilisez le formulaire du panneau
- [Politique de confidentialité](https://relay.mzpizote.com/privacy)
