# Premier démarrage et états vides (prioritaire)

Au départ, la base ne contient qu'un compte PDG et les six caisses : ni marque, ni format, ni prix, ni stock. Le PDG
saisit tout.

## Premier écran du PDG

- Tant que la mise en route n'est pas finie, le tableau de bord montre une liste d'étapes à la place des chiffres à zéro :
  1. marques et formats ; 2. prix du gaz ; 3. quartiers livrés et frais ; 4. comptes de l'équipe.
- Chaque étape dit si elle est faite (d'après les données lues, jamais d'après un réglage local) et mène à son écran.
- Les étapes qui dépendent d'une autre le disent (un prix demande un format).
- La liste disparaît quand tout est fait.

## États vides

- Jamais un tableau vide ni un « Aucun… » seul : une phrase qui dit pourquoi c'est vide, et l'action qui le remplit.
- Un profil sans le droit d'agir lit qui peut le faire (« Le PDG doit d'abord ajouter les prix »).
- Un formulaire qui dépend d'une liste vide (vente, réception, commande) ne s'affiche pas désactivé sans explication :
  il renvoie vers l'étape manquante.
- Vitrine en ligne sans prix ni stock : message clair au client, pas de panier.
