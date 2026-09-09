# Amazing Claude Code GUI

**Claude Code sous forme de panneau de discussion dans votre IDE JetBrains.** Des cartes plutôt
que le défilement du terminal, des fichiers que l'on désigne plutôt que des chemins que l'on
tape - et votre code juste à côté.

Il pilote le CLI Claude Code déjà installé sur votre machine : votre compte, les modèles, les
commandes en barre oblique, les règles de permissions, les serveurs MCP et les skills arrivent
avec lui. Pas de proxy au milieu, aucun compte chez nous.

🌐 [English](en.md) | [简体中文](zh.md) | [Русский](ru.md) | [Українська](uk.md) | [Español](es.md) | [Português (Brasil)](pt.md) | [Deutsch](de.md) | **Français** | [日本語](ja.md) | [한국어](ko.md)

## Pourquoi celui-ci

- **Un cycle de travail, écrit une fois et exécuté pour vous.** Les scénarios : quelques cartes,
  chacune une session Claude à part entière - implémenter, relire, corriger, lancer les tests - en
  étapes qui peuvent boucler plusieurs fois, avec un fil principal qui les parcourt et juge ce que
  chacune a trouvé. Lancez-en un d'un bouton, trois à la fois sur trois tickets, ou programmé
  chaque jour de semaine à neuf heures avec ses questions répondues à l'avance. Décrivez le cycle
  en une phrase, et Claude lit le projet et rédige le formulaire.
- **Tout le panneau depuis votre téléphone, pas seulement un bouton « oui ».** Répondez à une
  demande de permission ou à un plan, ouvrez un projet fermé, lisez la conversation d'hier,
  bifurquez, changez le modèle et l'effort, changez de compte, connectez-vous à un connecteur,
  dictez, suivez un scénario en cours d'exécution et débloquez-le. Désactivé par défaut, appairé
  par code QR, chiffré de bout en bout via un relais incapable de lire le moindre mot, révocable
  d'une pression.
- **Plusieurs comptes Claude, basculés en un clic.** Travail et personnel sur une seule machine,
  sans se déconnecter ni de l'un ni de l'autre. Chaque ligne affiche ce qu'il reste de la fenêtre
  de cinq heures de ce compte et de sa semaine, et Select y transfère toutes les conversations
  ouvertes.
- **Recherchez dans toutes les conversations du projet.** Préfixes, fautes de frappe, racines de
  mots, expressions entre guillemets ; cette conversation ou toutes, avec un saut direct vers le
  message dans sa conversation. Quand les mots ne suffisent pas, décrivez ce que vous cherchez et
  Claude lit les conversations à votre place.
- **Tout ce qu'il fait est à l'écran.** Chaque appel d'outil avec sa durée, chaque modification
  sous forme de diff ouvert, les sous-agents et des flottes entières d'agents de workflow avec la
  transcription de chaque agent à un clic de distance, la liste de tâches qui se coche, et ce qu'a
  coûté le tour. Une API surchargée ou limitée devient une carte avec la raison et le compte à
  rebours, pas un silence.
- **Personne ne répond à votre place, et rien ne se perd.** Une demande de permission, un plan ou
  une question attendent le temps qu'il faut - pas de délai, pas de reprise automatique. Les
  conversations continuent même panneau replié ou projet changé, et les messages écrits pendant un
  tour attendent dans une file que l'IDE conserve.
- **Android Studio compris**, comme tous les IDE JetBrains à partir de 2026.1.

## Pour commencer

1. Avoir Claude Code installé et fonctionnel dans un terminal : c'est ce CLI que le panneau
   pilote.
2. Ouvrir le panneau depuis le bouton de la barre latérale. Si vous n'êtes pas connecté, un bouton
   s'en charge dans le terminal de l'IDE.
3. Écrire votre message : déposez fichiers et dossiers dans le champ, `@` pour un fichier du
   projet, `/` pour une commande, `!` pour lancer quelque chose dans votre shell.
4. Sélectionnez du code dans l'éditeur et choisissez « Send to Amazing Claude Code GUI » : c'est
   une référence précise au fichier et aux lignes qui part, pas du texte collé.
5. Modèle, effort et mode de permissions sont les trois boutons sous le champ, et chacun appartient
   à l'onglet que vous regardez.

## Également dans le panneau

- **On désigne les fichiers, on ne les tape pas.** Glissez-en un, tapez `@` pour le choisir,
  collez une capture d'écran ou un long journal - chacun arrive sous forme de pastille où l'on ne
  peut pas se tromper.
- **Le code part avec son adresse.** Sélectionnez les lignes, « Send to Amazing Claude Code GUI »,
  et l'agent lit le vrai fichier autour d'elles au lieu d'un extrait sans contexte.
- **Les chemins ouvrent les fichiers.** Un chemin n'importe où dans la conversation - l'en-tête
  d'une carte, une réponse, une erreur, votre propre message - ouvre le fichier dans l'éditeur à
  la ligne qu'il indique ; une modification s'ouvre sur la modification elle-même.
- **Attrapez n'importe quel morceau d'une réponse.** Citez-le dans votre message suivant, faites
  bifurquer la conversation exactement à cet endroit, épinglez jusqu'à trois messages au-dessus de
  la conversation, ou reprenez un message envoyé dans le champ pour le corriger et le renvoyer.
- **Modèle, effort et mode changent en cours de conversation**, onglet par onglet, sans rien
  redémarrer. Ce sur quoi démarre une nouvelle conversation est à vous de le définir, et un modèle
  de votre propre serveur peut être ajouté à la main.
- **Les serveurs MCP, les plugins et les marketplaces** ont chacun leur propre écran : quel
  serveur est actif, lequel attend une connexion, lequel est tombé et pourquoi.
- **L'historique** des conversations passées de ce projet, y compris celles commencées au
  terminal, ouvert à partir de la fin et rechargé page par page sur demande.
- **Une file d'attente** pour les messages écrits pendant un tour, réordonnable par glisser.
- **`!` lance une commande dans votre propre shell**, et le résultat voyage avec votre prochain
  message, sans coûter de tour ni de demande de permission.
- **Améliorer le prompt** : l'étoile réécrit votre brouillon dans une exécution à part, sans
  consommer le contexte de la conversation, et un bouton vous rend vos propres mots.
- **La dictée vocale** avec votre propre clé Deepgram : maintenez un raccourci, même depuis
  l'éditeur.
- **Les alertes sonores** pour les sept moments qui le méritent, et seulement quand vous ne
  regardez pas déjà.
- **Des statistiques** d'heures, d'habitudes et de succès, partageables en image.
- **Dix langues**, celle de votre IDE par défaut.
- **Vos tampons non enregistrés** sont écrits avant un tour, et les fichiers modifiés par l'agent
  sont relus aussitôt.
- **Un panneau latéral, pas un onglet d'éditeur**, sur n'importe quel bord de la fenêtre ; les
  chiffres choisissent une option, Shift+Tab fait défiler le mode, Escape arrête le tour.

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
