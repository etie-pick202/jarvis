# ADR 0003 : Canal+, hypothèses de travail

- Date : 2026-11-26
- Statut : proposée (à confirmer par le PDG)

## Contexte

Le cahier des charges v1.1 laisse ouverte la question de l'agrément Canal+. Son hypothèse de travail : caisses et
commissions paramétrables, désactivables. Il ne donne ni la liste des formules, ni leurs prix, ni la durée couverte.

## Décision

- Les formules sont saisies dans l'application (nom, prix, durée en mois, commission), par le PDG ou le gérant. Aucune
  formule ni aucun prix n'est écrit dans le code.
- La commission vaut 0 par défaut ; elle ne sert que si COCOSAB est agent agréé. Une formule se désactive sans être
  effacée.
- La fiche abonné reprend le cahier : nom, téléphone, numéro de décodeur (unique), formule, date d'échéance. L'échéance
  est le dernier jour couvert ; elle se saisit à la création si elle existe déjà (aucun import).
- Les « échéances proches » sont, par défaut, celles des 7 prochains jours, dépassées comprises.

- Encaissement : le prix et la durée sont ceux de la formule au moment du paiement. Espèces ou Orange Money
  seulement (les deux caisses Canal+). La nouvelle échéance part de l'échéance en cours si elle n'est pas dépassée,
  sinon du jour du paiement, au même quantième.
- Annulation : réservée au gérant et au PDG, avec justificatif et notification ; seul le dernier encaissement d'un
  abonné peut être annulé, ce qui rétablit l'échéance précédente.

## Conséquences

Les valeurs peuvent changer sans reprogrammation. La fenêtre de relance (7 jours) est un paramètre de la requête.
