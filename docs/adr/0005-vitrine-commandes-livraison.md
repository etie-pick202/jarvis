# ADR 0005 : vitrine, commandes et livraison, hypothèses de travail

- Date : 2026-11-27
- Statut : proposée (à confirmer par le PDG et le gérant)

## Contexte

Le lot 3 touche plusieurs points ouverts du cahier des charges : horaires, commande minimale, majoration des frais de
livraison selon le quartier, contact et raison sociale.

## Décision

- Horaires d'ouverture et de prise de commande : textes libres réglés par le gérant ; ils s'affichent, ils ne
  bloquent pas la commande.
- Commande minimale : aucune au départ (0), montant réglable.
- Frais de livraison : 400 FCFA par bouteille par défaut, un montant par quartier saisi par le gérant et reproposé
  ensuite, plafond facultatif fixé par le PDG.
- La vitrine publique ne montre ni coût d'achat, ni quantité en stock, ni valeur d'emballage : seulement le prix et la
  disponibilité.

- Commande sans compte : rien n'est réservé tant que le gérant n'a pas validé ; le stock est revérifié à la
  validation, puis réservé (le comptoir et la vitrine ne le proposent plus). L'annulation le libère.
- Les prix sont ceux affichés à la commande.
- Garde-fou sans compte : 3 commandes en attente au plus par numéro de téléphone.
- Alerte du gérant : compteur des commandes en attente (`GET /orders/summary`).
- Paiement mobile : le client donne la référence, le gérant la confirme à la main.

## Conséquences

Tout se règle dans l'application, sans reprogrammation.
