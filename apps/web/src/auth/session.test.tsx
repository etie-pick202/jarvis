import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider, useSession } from "./SessionProvider.js";

function Etat() {
  const { session, mode } = useSession();
  return <p>{session ? `${session.nom}:${mode}` : "déconnecté"}</p>;
}

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("déconnecte automatiquement après 30 minutes sans action", async () => {
    setFakeUser("gerant");
    render(
      <SessionProvider initial={{ userId: "u2", nom: "Gérant", profils: ["gerant"], profilActif: "gerant" }}>
        <Etat />
      </SessionProvider>,
    );
    expect(screen.getByText("Gérant:gestion")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    });
    expect(screen.getByText("déconnecté")).toBeTruthy();
  });

  it("garde la session locale quand le réseau tombe, et l'efface si le serveur la refuse", async () => {
    localStorage.setItem(
      "jarvis.session",
      JSON.stringify({ userId: "u2", nom: "Gérant", profils: ["gerant"], profilActif: "gerant" }),
    );
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    const { unmount } = render(
      <SessionProvider>
        <Etat />
      </SessionProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("Gérant:gestion")).toBeTruthy();
    unmount();

    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
    setFakeUser(null);
    render(
      <SessionProvider>
        <Etat />
      </SessionProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("déconnecté")).toBeTruthy();
  });
});
