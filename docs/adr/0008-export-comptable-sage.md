# ADR 0008 : export comptable pour Sage

- Date : 2026-11-27
- Statut : proposée (à confirmer par le comptable, sur une copie du dossier Sage)

## Contexte

Le cahier des charges vise Sage 100 Gestion commerciale i7 v8.50 et Saisie de caisse i7 v8.01, sans décrire de
format d'import ni de plan de comptes. Son hypothèse : export adapté, testé sur une copie, avec repli en CSV.

## Décision

- Fichier texte à point-virgule : `Code journal;Date;N° pièce;N° compte;Libellé;Débit;Crédit`. Date JJMMAA,
  montants entiers en FCFA, encodage Latin-1, fins de ligne CRLF. Sage importe ce type de fichier par un format
  paramétrable, à créer une fois.
- Une écriture en partie double par mouvement de caisse (journal CAI pour les espèces, MOB pour le mobile).
- Contreparties : ventes de marchandises (701), livraison et abonnements Canal+ (706), dépenses (605), transferts,
  dépôts et retraits (585), écarts de clôture (758 ou 658), le reste en attente (471). Une annulation reprend le
  compte de l'écriture annulée.
- Comptes SYSCOHADA par défaut, réglables par le PDG. Aucune TVA (point à confirmer).

## Conséquences

Rien n'a été importé dans Sage : le format et les comptes restent à valider avec le comptable. Les abonnements
Canal+ encaissés pour le compte de l'opérateur peuvent relever d'un compte de tiers : à confirmer aussi.
