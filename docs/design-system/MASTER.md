# Système de design JARVIS

Référence de tout écran. Une page de `pages/` complète ou remplace ces règles pour les écrans qu'elle cite.

Base : maquette JARVIS (identité, or et noir) et logos existants. Une recommandation générée par l'outil de design a
été reprise pour la structure (tableau de bord « data-dense », règles d'accessibilité) et écartée pour les couleurs
(bleu) et la police (Fira) : elles contredisent l'identité.

## Principes

1. **Le travail d'abord** : sur téléphone, le contenu utile commence à moins de 120 px du haut.
2. **Une action principale par écran** (jaune). Le reste est discret.
3. **Dense au bureau, au pouce sur le terrain** : le PDG compare, le comptoir et le livreur agissent.
4. **Hors ligne** : aucune ressource distante ; polices, icônes et illustrations embarquées.
5. **Une base vide est un cas normal** : le premier démarrage guide le PDG (voir `pages/premier-demarrage.md`).

## Couleurs (jetons de `apps/web/src/styles/tokens.css`)

| Rôle                      | Jeton                                                             | Valeur                                                       |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Marque, action principale | `--jaune`                                                         | #FFC20E (texte noir dessus, jamais de texte jaune sur clair) |
| Marque, navigation        | `--noir`                                                          | #111111                                                      |
| Or clair, accent sur noir | `--or-clair`                                                      | #FFF1A8                                                      |
| Fond                      | `--creme`                                                         | #F6F4EC                                                      |
| Surface                   | `--blanc`                                                         | #FFFFFF                                                      |
| Filets / bord de champ    | `--ligne` / `--ligne-champ`                                       | #E3E0D5 / à foncer : 3:1 contre le fond                      |
| Texte / secondaire        | `--texte` / `--texte-doux`                                        | #111111 / #5F5E57                                            |
| États                     | `--ok-*`, `--alerte-*`, `--attention-*`, `--danger-*`, `--info-*` | couples fond + texte à 4,5:1                                 |

Un état n'est jamais porté par la couleur seule : un mot ou une icône l'accompagne.
**Pas de mode sombre** : la maquette n'en prévoit pas.

## Typographie

Space Grotesk (titres, chiffres clés) et Inter (texte), auto-hébergées, comme la maquette.

| Usage                  | Téléphone   | Bureau      |
| ---------------------- | ----------- | ----------- |
| Titre d'écran          | 22 px / 700 | 24 px / 700 |
| Titre de section       | 18 px / 700 | 16 px / 700 |
| Texte, champs, boutons | 16 px       | 14 px       |
| Métadonnées            | 14 px       | 12 px       |
| Chiffre clé            | 28 px       | 28 px       |

Jamais sous 14 px sur téléphone. Montants en chiffres tabulaires (`font-variant-numeric: tabular-nums`), alignés à
droite dans les tableaux.

## Espacements, rayons, ombres

- Espacements : 4, 8, 12, 16, 24, 32 px. Entre deux cibles tactiles : 8 px au moins.
- Rayons : 8 (champs, boutons), 12 (cartes), 999 (pastilles).
- Ombres : aucune sur les cartes (filet) ; une seule ombre pour ce qui flotte (feuille, tiroir, barre d'action).

## Composants

- **Barre d'application** : une seule ligne de 56 px (marque, état du réseau, menu). La langue et la
  déconnexion vont dans le menu ; la bascule vers le mode livreur reste dans la barre (un seul geste).
- **Rubriques** : onglets défilants de 44 px, rubrique active visible au chargement.
- **Page** : un titre (pas de répétition entre barre, page et carte) ; pas de carte dans une carte.
- **Boutons** : principal (jaune), secondaire (filet), discret (texte ou icône avec libellé accessible), danger
  (contour rouge). Hauteur 44 px au moins ; pleine largeur seulement pour l'action principale sur téléphone.
- **Listes et tableaux** : tableau compact au bureau (ligne de 44 px, en-tête collant) ; sous 640 px, une carte par
  ligne, sans défilement horizontal, actions visibles.
- **Formulaires de création** : la liste reste en premier ; la fiche est à droite au bureau et sous la liste sur
  téléphone, où un bouton à côté du titre y conduit. Elle reste affichée (les parcours de bout en bout s'y fient).
- **Champs** : libellé au-dessus, aide et erreur dessous ; clavier adapté (`inputmode`) ; sélection de fichier avec
  un bouton traduit.
- **États** : squelette à la forme du contenu pendant le chargement ; vide avec une action proposée ; erreur avec
  « Réessayer » ; hors ligne avec la file d'envoi.
- **Icônes** : tracés Lucide en SVG dans le code, 24 px, trait 2 ; aucun émoji ; `aria-hidden` si le texte suffit.

## Accessibilité et mouvement

- Contraste 4,5:1 (3:1 pour les grands titres, filets de champ et focus).
- Focus visible de 3 px sur tout élément interactif.
- Transitions de 150 à 200 ms sur couleur et opacité ; tout est coupé sous `prefers-reduced-motion`.

## Budget de performance

- Premier fragment JavaScript : pas de croissance de plus de 5 % ; aucune bibliothèque de composants.
- Lighthouse en CI inchangé ou meilleur à chaque étape.
