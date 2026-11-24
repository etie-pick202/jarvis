import type { MessageKey } from "../i18n/fr.js";

export type Profil = "pdg" | "gerant" | "caissier" | "livreur";

export interface Rubrique {
  id: string;
  label: MessageKey;
}

export interface Volet {
  id: string;
  /** Nom propre COCOSAB, identique dans les deux langues. */
  nom: string;
  label: MessageKey;
  rubriques: readonly Rubrique[];
  /** Profils qui voient le volet (cahier des charges, « Les dix volets »). */
  profils: readonly Profil[];
}

const r = (id: string, label: MessageKey): Rubrique => ({ id, label });

export const VOLETS: readonly Volet[] = [
  {
    id: "pilot",
    nom: "CoCoPilot",
    label: "volet.pilot",
    profils: ["pdg", "gerant"],
    rubriques: [
      r("tableau", "rub.pilot.tableau"),
      r("alertes", "rub.pilot.alertes"),
      r("validations", "rub.pilot.validations"),
      r("audit", "rub.pilot.audit"),
    ],
  },
  {
    id: "vente",
    nom: "CoCoVente",
    label: "volet.vente",
    profils: ["pdg", "gerant", "caissier"],
    rubriques: [
      r("nouvelle", "rub.vente.nouvelle"),
      r("commandes", "rub.vente.commandes"),
      r("historique", "rub.vente.historique"),
      r("clients", "rub.vente.clients"),
    ],
  },
  {
    id: "gaz",
    nom: "CoCoGaz",
    label: "volet.gaz",
    profils: ["pdg", "gerant", "caissier"],
    rubriques: [
      r("stock", "rub.gaz.stock"),
      r("echanges", "rub.gaz.echanges"),
      r("receptions", "rub.gaz.receptions"),
      r("fournisseurs", "rub.gaz.fournisseurs"),
      r("inventaire", "rub.gaz.inventaire"),
    ],
  },
  {
    id: "market",
    nom: "CoCoMarket",
    label: "volet.market",
    profils: ["pdg", "gerant", "caissier"],
    rubriques: [
      r("articles", "rub.market.articles"),
      r("stock", "rub.market.stock"),
      r("mouvements", "rub.market.mouvements"),
    ],
  },
  {
    id: "caisse",
    nom: "CoCoCaisse",
    label: "volet.caisse",
    profils: ["pdg", "gerant", "caissier"],
    rubriques: [
      r("soldes", "rub.caisse.soldes"),
      r("depenses", "rub.caisse.depenses"),
      r("transferts", "rub.caisse.transferts"),
      r("cloture", "rub.caisse.cloture"),
    ],
  },
  {
    id: "canal",
    nom: "CanalSab",
    label: "volet.canal",
    profils: ["pdg", "gerant", "caissier"],
    rubriques: [
      r("abonnes", "rub.canal.abonnes"),
      r("echeances", "rub.canal.echeances"),
      r("encaissements", "rub.canal.encaissements"),
      r("rappels", "rub.canal.rappels"),
    ],
  },
  {
    id: "money",
    nom: "CoCoMoney",
    label: "volet.money",
    profils: ["pdg", "gerant"],
    rubriques: [
      r("operations", "rub.money.operations"),
      r("float", "rub.money.float"),
      r("commissions", "rub.money.commissions"),
    ],
  },
  {
    id: "livre",
    nom: "CoCoLivre",
    label: "volet.livre",
    profils: ["pdg", "gerant", "livreur"],
    rubriques: [
      r("file", "rub.livre.file"),
      r("tournee", "rub.livre.tournee"),
      r("quartiers", "rub.livre.quartiers"),
      r("historique", "rub.livre.historique"),
    ],
  },
  {
    id: "rapport",
    nom: "CoCoRapport",
    label: "volet.rapport",
    profils: ["pdg", "gerant"],
    rubriques: [
      r("clients", "rub.rapport.clients"),
      r("journal", "rub.rapport.journal"),
      r("x", "rub.rapport.x"),
      r("gaz", "rub.rapport.gaz"),
      r("exports", "rub.rapport.exports"),
    ],
  },
  {
    id: "config",
    nom: "CoCoConfig",
    label: "volet.config",
    profils: ["pdg", "gerant"],
    rubriques: [
      r("marques", "rub.config.marques"),
      r("prix", "rub.config.prix"),
      r("utilisateurs", "rub.config.utilisateurs"),
      r("caisses", "rub.config.caisses"),
      r("notifications", "rub.config.notifications"),
      r("langue", "rub.config.langue"),
    ],
  },
];

export function voletsPour(profils: readonly Profil[]): Volet[] {
  return VOLETS.filter((v) => v.profils.some((p) => profils.includes(p)));
}

export function cheminVolet(volet: Volet, rubrique?: Rubrique): string {
  return `/${volet.id}/${(rubrique ?? volet.rubriques[0])?.id ?? ""}`;
}
