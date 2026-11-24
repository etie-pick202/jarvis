import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("affiche le nom et le prix de retrait", () => {
    const html = renderToString(<App />);
    expect(html).toContain("JARVIS");
    expect(html).toMatch(/6\s?800 FCFA/u);
  });
});
