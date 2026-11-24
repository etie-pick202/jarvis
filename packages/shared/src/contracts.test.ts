import { describe, expect, it } from "vitest";
import {
  apiError,
  cancelSaleInput,
  cashRegisterId,
  closeRegisterInput,
  createExpenseInput,
  createSaleInput,
  createTransferInput,
  errorBody,
  hasAnyRole,
  idempotencyKey,
  loginInput,
  role,
  stockMove,
} from "./index.js";

const uuid = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
const uuid2 = "7a2c4e6f-1b3d-4f5a-8c9e-0a1b2c3d4e5f";

describe("erreurs", () => {
  it("construit le format commun {error:{code,message}}", () => {
    const body = errorBody("out_of_stock", "Rupture");
    expect(apiError.parse(body)).toEqual({ error: { code: "out_of_stock", message: "Rupture" } });
  });
  it("refuse un code inconnu", () => {
    expect(apiError.safeParse({ error: { code: "x", message: "m" } }).success).toBe(false);
  });
});

describe("rôles", () => {
  it("connaît les quatre profils", () => {
    expect(role.options).toEqual(["pdg", "gerant", "livreur", "caissier"]);
  });
  it("vérifie un cumul de profils", () => {
    expect(hasAnyRole(["gerant", "livreur"], ["livreur"])).toBe(true);
    expect(hasAnyRole(["caissier"], ["pdg", "gerant"])).toBe(false);
  });
  it("valide la connexion", () => {
    expect(loginInput.safeParse({ username: "ab", password: "short" }).success).toBe(false);
    expect(loginInput.safeParse({ username: "gerant", password: "motdepasse1" }).success).toBe(true);
  });
});

describe("vente", () => {
  const gas = { kind: "gas", brandId: uuid, formatId: uuid2, quantity: 1 } as const;
  it("exige le nom du client pour le gaz", () => {
    const res = createSaleInput.safeParse({ paymentMethod: "cash", lines: [gas] });
    expect(res.success).toBe(false);
  });
  it("accepte le gaz avec un nom et un échange entre marques", () => {
    const res = createSaleInput.safeParse({
      customerName: "Awa",
      paymentMethod: "cash",
      lines: [{ ...gas, returnedBrandId: uuid2 }],
    });
    expect(res.success).toBe(true);
  });
  it("n'exige pas de nom pour un article libre", () => {
    const res = createSaleInput.safeParse({
      paymentMethod: "momo",
      lines: [{ kind: "article", articleId: uuid, quantity: 2 }],
    });
    expect(res.success).toBe(true);
  });
  it("refuse une quantité décimale ou nulle et un montant décimal", () => {
    expect(
      createSaleInput.safeParse({
        customerName: "A",
        paymentMethod: "cash",
        lines: [{ ...gas, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createSaleInput.safeParse({
        customerName: "A",
        paymentMethod: "cash",
        deliveryFeePerBottle: 400.5,
        lines: [gas],
      }).success,
    ).toBe(false);
  });
  it("refuse tout paiement hors espèces, Orange Money et MoMo (pas de crédit)", () => {
    expect(
      createSaleInput.safeParse({ customerName: "A", paymentMethod: "credit", lines: [gas] }).success,
    ).toBe(false);
  });
  it("exige un justificatif pour annuler", () => {
    expect(cancelSaleInput.safeParse({ justification: "  " }).success).toBe(false);
    expect(cancelSaleInput.safeParse({ justification: "Erreur de saisie" }).success).toBe(true);
  });
});

describe("caisses", () => {
  it("compte six caisses", () => {
    expect(cashRegisterId.options).toHaveLength(6);
  });
  it("refuse un transfert vers la même caisse", () => {
    const same = { fromRegisterId: "canal_om", toRegisterId: "canal_om", amount: 100, label: "x" };
    expect(createTransferInput.safeParse(same).success).toBe(false);
    expect(createTransferInput.safeParse({ ...same, toRegisterId: "canal_cash" }).success).toBe(true);
  });
  it("refuse une dépense nulle", () => {
    expect(createExpenseInput.safeParse({ registerId: "sales_cash", amount: 0, label: "x" }).success).toBe(
      false,
    );
  });
  it("accepte un comptage de clôture", () => {
    expect(closeRegisterInput.safeParse({ registerId: "sales_cash", countedAmount: 1000 }).success).toBe(
      true,
    );
  });
});

describe("stock et idempotence", () => {
  it("refuse un mouvement de stock nul", () => {
    const base = {
      id: uuid,
      brandId: uuid,
      formatId: uuid2,
      state: "full",
      delta: 0,
      reason: "sale",
      saleId: null,
      receptionId: null,
      reversalOf: null,
      justification: null,
      authorId: uuid,
      createdAt: "2026-11-24T10:00:00Z",
    };
    expect(stockMove.safeParse(base).success).toBe(false);
    expect(stockMove.safeParse({ ...base, delta: -1 }).success).toBe(true);
  });
  it("borne la clé d'idempotence", () => {
    expect(idempotencyKey.safeParse("abc").success).toBe(false);
    expect(idempotencyKey.safeParse("op-1234-abcd").success).toBe(true);
  });
});
