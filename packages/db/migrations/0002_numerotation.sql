-- Numérotation continue des tickets de vente et des mouvements de caisse (jamais de trou ni de doublon).
-- Le PDG peut la faire redémarrer ailleurs : ALTER SEQUENCE ... RESTART WITH <n>.
CREATE SEQUENCE sale_number_seq START 1;
--> statement-breakpoint
CREATE SEQUENCE cash_entry_number_seq START 1;
