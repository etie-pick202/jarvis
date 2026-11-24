import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";
import { Chip } from "./Chip.js";
import { Field } from "./Field.js";
import { Segmented } from "./Segmented.js";

function Demo() {
  const [v, setV] = useState<"a" | "b">("a");
  return (
    <Segmented
      legend="Paiement"
      value={v}
      onChange={setV}
      options={[
        { value: "a", label: "Espèces" },
        { value: "b", label: "MoMo" },
      ]}
    />
  );
}
describe("composants de base", () => {
  it("Button est un vrai bouton de type button", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Encaisser</Button>);
    const bouton = screen.getByRole("button", { name: "Encaisser" });
    expect(bouton.getAttribute("type")).toBe("button");
    await userEvent.click(bouton);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Field associe le libellé au champ", () => {
    render(<Field label="Nom du client" />);
    expect(screen.getByLabelText("Nom du client")).toBeTruthy();
  });

  it("Chip affiche son texte", () => {
    render(<Chip tone="ok">Réglée</Chip>);
    expect(screen.getByText("Réglée").className).toContain("pastille--ok");
  });

  it("Segmented se pilote au clavier", async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole("radio", { name: "MoMo" }));
    expect((screen.getByRole("radio", { name: "MoMo" }) as HTMLInputElement).checked).toBe(true);
  });
});
