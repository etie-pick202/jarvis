import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { lireMontant } from "../caisse/donnees.js";
import { useGarde } from "./useEnvoi.js";

function Formulaire({ action }: Readonly<{ action: () => Promise<void> }>) {
  const garde = useGarde();
  return (
    <form onSubmit={garde(action)}>
      <button type="submit">Envoyer</button>
    </form>
  );
}

describe("saisies", () => {
  it("ignore le second envoi tant que le premier court, puis accepte à nouveau", async () => {
    let finir: () => void = () => undefined;
    const action = vi.fn(() => new Promise<void>((r) => (finir = r)));
    render(<Formulaire action={action} />);
    const bouton = screen.getByRole("button");
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    expect(action).toHaveBeenCalledTimes(1);
    finir();
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(bouton);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("refuse les montants extrêmes ou mal écrits", () => {
    expect(lireMontant("999999999")).toBe(999_999_999);
    for (const faux of ["1000000000", "0", "-5", "1,5", "1e6", ""]) expect(lireMontant(faux)).toBeNull();
  });
});
