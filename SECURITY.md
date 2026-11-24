# Sécurité

## Signaler une faille

Ne créez pas de ticket public. Écrivez au chef de projet (voir `CODEOWNERS`) ou utilisez _Security > Report a vulnerability_ sur GitHub.

## Règles du dépôt public

1. Aucun secret dans le code ni dans l'historique : mots de passe, clés, jetons, adresses IP privées, accès au serveur.
2. Aucune donnée réelle : ni ventes, ni clients, ni numéros de téléphone, ni photos de pièces fournisseurs, ni sauvegardes.
3. Données d'essai fictives uniquement (`packages/db`).
4. Les secrets vivent dans les secrets GitHub (par environnement) et dans le fichier `.env` du serveur.
5. Un secret publié par erreur est considéré comme perdu : le changer **tout de suite**, puis nettoyer l'historique.
6. Les workflows de déploiement ne tournent jamais sur une pull request venant d'un fork.
