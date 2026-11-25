import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { EtatVide } from "../visuels/Illustration.js";
import { discard, flush, retry } from "./outbox.js";
import { sendOperation } from "./sync.js";
import { useOutbox } from "./useConnection.js";

/** Liste des opérations en attente, en conflit ou refusées : rien n'est effacé sans choix de l'utilisateur. */
export function SyncPage() {
  const { t } = useI18n();
  const ops = useOutbox();
  return (
    <section className="carte">
      <h1>{t("sync.titre")}</h1>
      {ops.some((o) => o.status === "conflict") && (
        <EtatVide genre="conflit" titre={t("sync.conflit.titre")} texte={t("sync.conflit.texte")} />
      )}
      {ops.length === 0 && <EtatVide genre="vide" titre={t("sync.vide")} />}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {ops.map((op) => (
          <li key={op.id} className="carte">
            <strong>{op.label}</strong>
            <Chip tone={op.status === "pending" ? "alerte" : "danger"}>{t(`sync.statut.${op.status}`)}</Chip>
            {op.pieceId && op.status === "pending" && <Chip tone="info">{t("sync.piece")}</Chip>}
            {op.detail && <p>{op.detail}</p>}
            {op.status !== "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="noir"
                  onClick={async () => {
                    await retry(op.id);
                    await flush(sendOperation);
                  }}
                >
                  {t("sync.reessayer")}
                </Button>
                <Button variant="contour" onClick={() => discard(op.id)}>
                  {t("sync.ecarter")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
