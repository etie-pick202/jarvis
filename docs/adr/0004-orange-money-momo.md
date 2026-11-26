# ADR 0004 : Orange Money et MoMo, hypothèses de travail

- Date : 2026-11-26
- Statut : proposée (à confirmer par le PDG)

## Contexte

L'agrément Orange Money et MoMo n'est pas confirmé. Le cahier des charges prévoit deux caisses de transaction en
stand-by, activables en un réglage, et des commissions paramétrables.

## Décision

- La caisse « transaction » d'un opérateur porte son float (solde électronique). Les espèces des clients passent par
  la caisse des ventes en espèces.
- Dépôt : espèces en entrée, float en sortie. Retrait : l'inverse. Aucun des deux soldes ne devient négatif.
- Le float s'approvisionne par un transfert entre caisses existant.
- Commission : taux en points de base par opérateur et par sens, réglé par le PDG, 0 par défaut. Elle est notée sur
  l'opération, sans mouvement de caisse (versée plus tard par l'opérateur).
- La référence de transaction est obligatoire et unique par opérateur.

## Conséquences

Rien ne fonctionne tant que le PDG n'a pas activé la caisse. Si COCOSAB n'est pas agent agréé, la fonction reste
inactive.
