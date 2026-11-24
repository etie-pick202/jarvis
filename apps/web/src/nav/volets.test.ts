import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import { fr } from "../i18n/fr.js";
import { cheminVolet, VOLETS, voletsPour } from "./volets.js";

describe("volets", () => {
  it("compte dix volets et des libellés dans les deux langues", () => {
    expect(VOLETS).toHaveLength(10);
    for (const v of VOLETS) {
      expect(fr[v.label]).toBeTruthy();
      expect(en[v.label]).toBeTruthy();
      for (const r of v.rubriques) expect(en[r.label]).toBeTruthy();
    }
  });

  it("le livreur ne voit que les livraisons", () => {
    expect(voletsPour(["livreur"]).map((v) => v.id)).toEqual(["livre"]);
  });

  it("le caissier ne voit ni le pilotage ni les rapports", () => {
    const ids = voletsPour(["caissier"]).map((v) => v.id);
    expect(ids).not.toContain("pilot");
    expect(ids).not.toContain("rapport");
  });

  it("construit le chemin d'un volet", () => {
    expect(cheminVolet(VOLETS[1] ?? (VOLETS[0] as never))).toBe("/vente/nouvelle");
  });
});
