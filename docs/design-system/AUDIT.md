# Audit de l'interface avant refonte

Captures du 27/11/2026 de l'application (develop, `1dda732`) en **mode démonstration** (faux serveur, données
fictives), bureau 1440 px et téléphone 375 px, tous les volets. La vraie API locale n'était plus joignable au moment
des captures : les états propres aux données réelles ne sont pas couverts. Le mode livreur n'a pas été capturé.

## Défauts, du plus gênant au moins gênant

1. **En-tête de téléphone** : deux rangées (marque, langue, puis « Déconnexion » seule), puis les rubriques et un grand
   titre. Le contenu utile commence vers le tiers de l'écran.
2. **Bureau sous-employé** : le contenu tient dans une colonne étroite, une large part de l'écran reste vide. Le
   tableau de bord est une suite de tuiles égales, sans hiérarchie ; une marge négative n'est pas signalée.
3. **Tout se ressemble** : boutons de 52 px, souvent pleine largeur, répétés sur chaque ligne (Modifier, Désactiver) ;
   l'action principale ne se distingue pas.
4. **Pages longues** : les formulaires de création sont toujours ouverts sous les listes (jusqu'à environ 2 600 px de
   haut au bureau et sur téléphone pour les exports, les abonnés, les marques).
5. **Tableaux sur téléphone** : colonnes et actions cachées hors de l'écran (marques, échéances, historique des ventes).
6. **Titres répétés** et cartes dans des cartes.
7. **Petits textes** : sur les 46 écrans de téléphone, tous contiennent du texte sous 16 px (libellés à 11–13 px).
8. **Cibles trop petites** : 55 éléments sous 44 px sur téléphone (liens de téléphone, liens en ligne).
9. **Pastilles de marque** de largeurs incohérentes dans le choix d'article.
10. **Chargement** : un simple texte « Chargement… » ; la maquette prévoit des squelettes.
11. **Contrôles natifs** non harmonisés (« Choose File » en anglais dans une interface en français).
12. **Mouvement** : aucune règle CSS `prefers-reduced-motion` (seul le logo en tient compte).

## Priorité ajoutée : base vide

La base de l'utilisateur ne contient qu'un compte PDG et les six caisses. Le premier démarrage et les états vides
passent en priorité ([détail](pages/premier-demarrage.md)). Ces écrans vides ne sont pas encore audités : les captures
ci-dessus montrent des données fictives.

## Direction retenue

« Or et noir, atelier clair » : identité conservée (jaune, noir, crème, Inter et Space Grotesk auto-hébergées),
barre d'application sur une ligne, tableau de bord dense au bureau, comptoir et livreur au pouce avec action fixée en
bas, cartes à la place des tableaux sur téléphone, formulaires à la demande, squelettes. Pas de mode sombre (la
maquette n'en prévoit pas). Détail : [MASTER.md](MASTER.md).

## Étapes proposées (une PR chacune)

1. Jetons, composants partagés, coque (barre, rubriques, navigation), états vides et squelettes, premier démarrage.
2. Pilotage, ventes, livraisons et mode livreur.
3. Gaz, caisses, autres articles.
4. Canal+, mobile money, rapports, paramètres, boutique et connexion.
