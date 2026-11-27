import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { Commandes, HistoriqueCommandes } from "./Commandes.js";
import { actionsPossibles, refus } from "./regles.js";

const ui = (node: React.ReactNode = <Commandes />, profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const envois: { route: string; corps: unknown }[] = [];
function serveur(refuser?: () => Response) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const route = url.replace("/api/v1", "");
    if (init?.method === "POST") {
      envois.push({ route, corps: JSON.parse(String(init.body)) });
      if (refuser) return refuser();
    }
    return fakeApi(route, init);
  });
}
const carte = async (numero: string) =>
  within(await screen.findByRole("article", { name: new RegExp(numero, "u") }));

describe("règles des commandes", () => {
  const base = { mode: "delivery", paymentMethod: "cash", paymentConfirmedAt: null } as never;
  it("ne propose que ce que le serveur acceptera", () => {
    const o = (plus: object) => actionsPossibles({ ...(base as object), ...plus } as never);
    expect(o({ status: "pending" })).toEqual(["validate", "cancel"]);
    expect(o({ status: "out_for_delivery" })).toEqual(["assign"]);
    expect(o({ status: "validated", mode: "pickup", paymentMethod: "momo" })).toEqual([
      "confirm-payment",
      "collect",
      "cancel",
    ]);
    expect(o({ status: "delivered" })).toEqual([]);
    expect(refus(new ApiError(409, "Rupture : OLA"))).toBe("Rupture : OLA");
    expect(refus(new ApiError(502, "x"))).toBeNull();
    expect(refus(new TypeError("x"))).toBeNull();
  });
});

describe("commandes de la boutique", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    envois.length = 0;
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("confirme un paiement puis valide avec des frais ajustés, une seule fois", async () => {
    ui();
    const c = await carte("CMD0201");
    expect(c.getByText(/MOMO-0001/u)).toBeTruthy();
    await userEvent.click(c.getByRole("button", { name: "Confirmer le paiement" }));
    await waitFor(() => expect(c.queryByRole("button", { name: "Confirmer le paiement" })).toBeNull());
    const frais = c.getByLabelText("Frais de livraison par bouteille (CMD0201)");
    await userEvent.clear(frais);
    await userEvent.type(frais, "500");
    const valider = c.getByRole("button", { name: "Valider la commande" });
    fireEvent.click(valider);
    fireEvent.click(valider);
    await waitFor(() => expect(screen.queryByRole("article", { name: /CMD0201/u })).toBeNull());
    expect(envois.filter((e) => e.route.endsWith("/validate"))).toHaveLength(1);
    expect(envois.at(-1)?.corps).toEqual({ deliveryFeePerBottle: 500 });
  });

  it("montre le refus du serveur, ou la panne, sans perdre la commande", async () => {
    serveur(
      () =>
        new Response(JSON.stringify({ error: { code: "out_of_stock", message: "Rupture : OLA" } }), {
          status: 409,
        }),
    );
    ui();
    const c = await carte("CMD0201");
    await userEvent.click(c.getByRole("button", { name: "Valider la commande" }));
    expect((await screen.findByRole("alert")).textContent).toBe("CMD0201 : Rupture : OLA");
    serveur(() => new Response("{}", { status: 503 }));
    await userEvent.click(c.getByRole("button", { name: "Valider la commande" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("réessayez"));
    expect(screen.getByRole("article", { name: /CMD0201/u })).toBeTruthy();
  });

  it("confie à un livreur, remet un retrait après encaissement et annule avec motif", async () => {
    ui();
    await carte("CMD0201");
    await userEvent.click(screen.getByRole("radio", { name: /En cours/u }));
    const livraison = await carte("CMD0202");
    await userEvent.selectOptions(livraison.getByLabelText("Livreur (CMD0202)"), "Livreur démo");
    await waitFor(() => expect(envois.at(-1)?.route).toMatch(/assign$/u));
    const retrait = await carte("CMD0203");
    await userEvent.click(retrait.getByRole("button", { name: "Remise au client" }));
    const confirmer = retrait.getByRole("button", { name: "Confirmer la remise" }) as HTMLButtonElement;
    expect(confirmer.disabled).toBe(true);
    await userEvent.click(retrait.getByRole("checkbox"));
    await userEvent.click(confirmer);
    await waitFor(() => expect(screen.queryByRole("article", { name: /CMD0203/u })).toBeNull());
    expect(envois.at(-1)?.corps).toEqual({ paymentMethod: "cash" });
    await userEvent.click(livraison.getByRole("button", { name: "Annuler" }));
    await userEvent.type(livraison.getByLabelText(/Motif/u), "client injoignable");
    await userEvent.click(livraison.getByRole("button", { name: "Confirmer l'annulation" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: /CMD0202/u })).toBeNull());
    expect(envois.at(-1)?.corps).toEqual({ justification: "client injoignable" });
  });

  it("le caissier consulte sans agir ; l'historique montre les terminées", async () => {
    const { unmount } = ui(<Commandes />, "caissier");
    const c = await carte("CMD0201");
    expect(c.queryByRole("button")).toBeNull();
    unmount();
    ui(<HistoriqueCommandes />);
    expect(await screen.findByRole("article", { name: /CMD0204/u })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
