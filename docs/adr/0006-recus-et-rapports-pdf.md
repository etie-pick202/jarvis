# ADR 0006 : reçus et rapports en PDF, hypothèses de travail

- Date : 2026-11-27
- Statut : proposée (à confirmer par le PDG et le comptable)

## Contexte

Le cahier des charges retient : reçu simple (pas de facture normalisée), PDF et WhatsApp d'abord, rapports en PDF par
WhatsApp et par e-mail, aucun service payant. La raison sociale n'est pas fixée.

## Décision

- L'API produit les PDF (reçu, statistiques clients, journal de caisse, X de caisse, situation gaz), sans dépendance.
- En-tête « COCOSAB » provisoire ; mention « ne vaut pas facture normalisée » ; aucune TVA affichée.
- WhatsApp par lien prérempli. Un lien ne peut pas joindre de fichier : le PDF se télécharge puis se joint à la main.
- L'envoi automatique par e-mail n'est pas fait : il demande un service d'envoi, à choisir avec l'hébergement. Le PDF
  se joint à la main en attendant.

## Conséquences

L'envoi par e-mail et l'impression restent à traiter quand l'hébergement et le matériel seront connus.
