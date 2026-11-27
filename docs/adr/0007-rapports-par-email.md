# ADR 0007 : envoi des rapports par e-mail

- Date : 2026-11-27
- Statut : proposée

## Contexte

Le cahier des charges demande les rapports dans l'application, en PDF par WhatsApp et par e-mail, sans service
payant. L'hébergement, donc le serveur d'envoi, n'est pas encore choisi.

## Décision

- SMTP standard (bibliothèque nodemailer), configuré par `SMTP_URL` et `SMTP_FROM` ; sans eux, l'envoi est inactif.
  Aucun identifiant dans le dépôt.
- Envoi à la demande par le gérant ou le PDG, aux seules adresses réglées par le PDG : aucune adresse libre.
- Aucun envoi automatique en fin de journée : il demande un planificateur, à choisir avec l'hébergement.

## Conséquences

Tout fournisseur SMTP convient. Chaque envoi est tracé au journal d'audit.
