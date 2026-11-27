import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { CommandeTelephone } from "./Telephone.js";

const envois: Record<string, unknown>[] = [];
function serveur(refuser?: () => Response) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      envois.push(JSON.parse(String(init.body)));
      if (refuser) return refuser();
    }
    return fakeApi(url.replace("/api/v1", ""), init);
  });
}

describe("commande par téléphone", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    envois.length = 0;
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dit ce qui manque, garde la référence après un refus, puis enregistre une seule fois", async () => {
    const recue = vi.fn();
    render(
      <I18nProvider initial="fr">
        <CommandeTelephone onRecue={recue} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Commande par téléphone" }));
    const f = within(await screen.findByRole("form", { name: "Commande par téléphone" }));
    const valider = () => f.getByRole("button", { name: /^Enregistrer la commande/u }) as HTMLButtonElement;
    expect(f.getByText("Indiquez au moins un produit.")).toBeTruthy();
    await userEvent.type(f.getByLabelText("Quantité : Gaz OLA 12,5 kg"), "2");
    await userEvent.type(f.getByLabelText("Client"), "Client Essai");
    await userEvent.type(f.getByLabelText("Téléphone"), "690000055");
    await userEvent.selectOptions(f.getByLabelText("Quartier"), "Quartier Essai Nord");
    await userEvent.click(f.getByRole("radio", { name: "MoMo" }));
    await userEvent.type(f.getByLabelText("Référence du paiement mobile"), "MOMO-9");
    serveur(
      () =>
        new Response(JSON.stringify({ error: { code: "out_of_stock", message: "Rupture : OLA" } }), {
          status: 409,
        }),
    );
    await userEvent.click(valider());
    expect((await f.findByRole("alert")).textContent).toBe("Rupture : OLA");
    serveur();
    const bouton = valider();
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    expect(await screen.findByText("Commande enregistrée : CMD0001")).toBeTruthy();
    await waitFor(() => expect(recue).toHaveBeenCalledTimes(1));
    expect(envois).toHaveLength(2);
    expect(envois[1]?.clientRef).toBe(envois[0]?.clientRef);
    expect(envois[1]).toMatchObject({
      phone: "+237690000055",
      mode: "delivery",
      paymentMethod: "momo",
      lines: [{ quantity: 2 }],
    });
  });
});
