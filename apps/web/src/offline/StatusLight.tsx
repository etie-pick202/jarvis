import { Link } from "react-router";
import { useI18n } from "../i18n/index.js";
import { useOnline, useOutbox } from "./useConnection.js";

/** Voyant permanent : état de la connexion et nombre d'opérations en attente d'envoi. */
export function StatusLight() {
  const { t } = useI18n();
  const online = useOnline();
  const ops = useOutbox();
  const waiting = ops.filter((o) => o.status === "pending").length;
  const problems = ops.length - waiting;
  return (
    <div className="voyant" role="status">
      <span className={`voyant__point${online ? "" : " voyant__point--hors"}`} aria-hidden="true" />
      <span>{online ? t("sync.enligne") : t("sync.horsligne")}</span>
      {waiting > 0 && <span className="pastille pastille--alerte">{`${waiting} ${t("sync.attente")}`}</span>}
      {problems > 0 && (
        <Link className="pastille pastille--danger" to="/sync">
          {`${problems} ${t("sync.conflits")}`}
        </Link>
      )}
    </div>
  );
}
