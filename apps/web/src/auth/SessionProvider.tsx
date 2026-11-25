import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  garderJeton,
  type LoginInput,
  newIdempotencyKey,
  oublierJeton,
  type Session,
} from "../api/index.js";
import type { Profil } from "../nav/volets.js";

export type Mode = "gestion" | "livreur";

interface SessionState {
  session: Session | null;
  loading: boolean;
  mode: Mode;
  /** Profils effectifs : en mode livreur, seul le profil livreur compte. */
  profilsActifs: Profil[];
  login: (input: LoginInput) => Promise<void>;
  logout: (expiree?: boolean) => Promise<void>;
  setMode: (mode: Mode) => void;
}

const SessionContext = createContext<SessionState | null>(null);
const INACTIVITE_MS = 30 * 60 * 1000;
const CLE = "jarvis.session";
/** Posé quand la session se ferme toute seule (inactivité, jeton refusé) : la connexion l'explique. */
export const CLE_EXPIREE = "jarvis.expiree";

function lire(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Session | null }) {
  // La session est gardée sur l'appareil pour rester ouverte hors ligne ; l'API la revalide au retour du réseau.
  const [session, setSession] = useState<Session | null>(initial === undefined ? lire() : initial);
  const [loading, setLoading] = useState(initial === undefined);
  const [mode, setModeState] = useState<Mode>("gestion");

  useEffect(() => {
    if (initial !== undefined) return;
    api
      .me()
      .then((s) => {
        setSession(s);
        localStorage.setItem(CLE, JSON.stringify(s));
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          sessionStorage.setItem(CLE_EXPIREE, "1");
          setSession(null);
          oublierJeton();
          localStorage.removeItem(CLE);
        }
      })
      .finally(() => setLoading(false));
  }, [initial]);

  const logout = useCallback(async (expiree = false) => {
    if (expiree) sessionStorage.setItem(CLE_EXPIREE, "1");
    setSession(null);
    setModeState("gestion");
    localStorage.removeItem(CLE);
    await api.logout(newIdempotencyKey()).catch(() => null);
    oublierJeton();
  }, []);

  // Déconnexion automatique après 30 minutes sans action.
  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(() => void logout(true), INACTIVITE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logout(true), INACTIVITE_MS);
    };
    const events = ["pointerdown", "keydown"] as const;
    for (const e of events) window.addEventListener(e, reset);
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [session, logout]);

  const login = useCallback(async (input: LoginInput) => {
    const { token, session: s } = await api.login(input, newIdempotencyKey());
    garderJeton(token);
    localStorage.setItem(CLE, JSON.stringify(s));
    setSession(s);
  }, []);

  /** Bascule de profil sans reconnexion : le serveur change le profil actif ; hors ligne, seul l'affichage change. */
  const setMode = useCallback(
    (cible: Mode) => {
      setModeState(cible);
      const role = cible === "livreur" ? "livreur" : session?.profils.find((p) => p !== "livreur");
      if (!role || !navigator.onLine) return;
      api
        .switchRole(role, newIdempotencyKey())
        .then(setSession)
        .catch(() => undefined);
    },
    [session],
  );

  const value = useMemo<SessionState>(() => {
    const seulLivreur = session?.profils.length === 1 && session.profils[0] === "livreur";
    const effectif: Mode = seulLivreur ? "livreur" : mode;
    return {
      session,
      loading,
      mode: effectif,
      profilsActifs: effectif === "livreur" ? ["livreur"] : (session?.profils ?? []),
      login,
      logout,
      setMode,
    };
  }, [session, loading, mode, login, logout, setMode]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>");
  return ctx;
}
