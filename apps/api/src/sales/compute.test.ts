import { describe, expect, it } from "vitest";
import { aggregateFullDemand, computeGasLine, lineMargin } from "./compute.js";

const price = { amount: 6500, transportContribution: 300, purchaseCost: 6170 };

describe("calcul d'une ligne de gaz", () => {
  it("retrait au comptoir : 6 500 + 300 = 6 800 par bouteille", () => {
    const r = computeGasLine(price, 2, 0, 20000, 20000);
    expect(r.total).toBe(13600);
    expect(r.packagingGap).toBe(0);
  });
  it("livraison : +400 par bouteille, 7 200 au total pour une recharge", () => {
    expect(computeGasLine(price, 1, 400, 17500, 17500).total).toBe(7200);
  });
  it("échange entre marques : même prix, écart d'emballage en perte (TOTAL rapportée, STARGAS remise)", () => {
    const r = computeGasLine(price, 1, 0, 20000, 17500);
    expect(r.total).toBe(6800);
    expect(r.packagingGap).toBe(-2500);
  });
  it("échange entre marques : écart en gain quand la bouteille rapportée vaut plus", () => {
    expect(computeGasLine(price, 2, 0, 15900, 20000).packagingGap).toBe(8200);
  });
});

describe("marge", () => {
  it("marge de 630 par recharge : 430 sur le gaz + 200 sur la contribution transport", () => {
    expect(lineMargin(computeGasLine(price, 1, 0, 1, 1), 1)).toBe(630);
  });
  it("la livraison paie le livreur : hors marge ; l'écart d'emballage s'y ajoute", () => {
    expect(lineMargin(computeGasLine(price, 1, 400, 20000, 17500), 1)).toBe(630 - 2500);
  });
});

describe("demande de pleins", () => {
  it("additionne les lignes de même marque et format", () => {
    const d = aggregateFullDemand([
      { brandId: "b", formatId: "f", quantity: 1 },
      { brandId: "a", formatId: "f", quantity: 2 },
      { brandId: "b", formatId: "f", quantity: 3 },
    ]);
    expect([...d.values()].map((x) => `${x.brandId}:${x.quantity}`)).toEqual(["a:2", "b:4"]);
  });
});
