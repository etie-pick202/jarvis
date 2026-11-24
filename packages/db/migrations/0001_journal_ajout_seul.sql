-- Journal en ajout seul : aucune écriture ne peut être modifiée ni effacée.
-- Une correction ajoute une écriture inverse (colonne reversal_of) avec justificatif.
CREATE FUNCTION jarvis_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Journal en ajout seul : % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sales_append_only BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER sale_lines_append_only BEFORE UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_entries_append_only BEFORE UPDATE OR DELETE ON cash_entries FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER stock_moves_append_only BEFORE UPDATE OR DELETE ON stock_moves FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_closures_append_only BEFORE UPDATE OR DELETE ON cash_closures FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
CREATE TRIGGER gas_prices_append_only BEFORE UPDATE OR DELETE ON gas_prices FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
--> statement-breakpoint
-- Règles de gestion portées par la base : aucun crédit, montants entiers cohérents.
ALTER TABLE sales ADD CONSTRAINT sales_payment_method CHECK (payment_method IN ('cash', 'orange_money', 'momo'));
--> statement-breakpoint
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_kind CHECK (kind IN ('gas', 'article'));
--> statement-breakpoint
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_quantity CHECK (quantity <> 0);
--> statement-breakpoint
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_state CHECK (state IN ('full', 'empty'));
--> statement-breakpoint
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_delta CHECK (delta <> 0);
--> statement-breakpoint
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_direction CHECK (direction IN ('in', 'out'));
--> statement-breakpoint
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_type CHECK (type IN ('REG', 'ACP', 'MEC', 'MSC', 'FDC'));
--> statement-breakpoint
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_amount CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_payment_method CHECK (payment_method IN ('cash', 'orange_money', 'momo'));
--> statement-breakpoint
ALTER TABLE gas_prices ADD CONSTRAINT gas_prices_amount CHECK (amount >= 0 AND transport_contribution >= 0);
--> statement-breakpoint
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role CHECK (role IN ('pdg', 'gerant', 'livreur', 'caissier'));
--> statement-breakpoint
ALTER TABLE receptions ADD CONSTRAINT receptions_receipt_required CHECK (length(trim(receipt_ref)) > 0);
