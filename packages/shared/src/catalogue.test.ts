import { describe, expect, it } from "vitest";
import {
  createArticleInput,
  createBrandInput,
  createFormatInput,
  setGasPriceInput,
  updateArticleInput,
  updateBrandInput,
  updateFormatInput,
} from "./catalogue.js";

const uuid = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("catalogue", () => {
  it("refuse une marque sans nom ou avec une valeur d'emballage décimale", () => {
    expect(createBrandInput.safeParse({ name: " ", packagingValue: 100 }).success).toBe(false);
    expect(createBrandInput.safeParse({ name: "A", packagingValue: 10.5 }).success).toBe(false);
    expect(createBrandInput.safeParse({ name: "A", packagingValue: 15900 }).success).toBe(true);
  });
  it("exige au moins un champ pour modifier", () => {
    expect(updateBrandInput.safeParse({}).success).toBe(false);
    expect(updateFormatInput.safeParse({}).success).toBe(false);
    expect(updateArticleInput.safeParse({}).success).toBe(false);
    expect(updateBrandInput.safeParse({ active: false }).success).toBe(true);
  });
  it("accepte un format avec ou sans plafond", () => {
    expect(createFormatInput.safeParse({ label: "12,5 kg", weightGrams: 12500 }).success).toBe(true);
    expect(
      createFormatInput.safeParse({ label: "6 kg", weightGrams: 6000, priceCeiling: null }).success,
    ).toBe(true);
    expect(createFormatInput.safeParse({ label: "x", weightGrams: 0 }).success).toBe(false);
  });
  it("applique les valeurs par défaut du prix et de l'article", () => {
    const price = setGasPriceInput.parse({ formatId: uuid, amount: 6500 });
    expect(price.transportContribution).toBe(0);
    const article = createArticleInput.parse({ name: "Tuyau", price: 1500 });
    expect(article).toMatchObject({ trackStock: false, purchaseCost: 0 });
  });
});
