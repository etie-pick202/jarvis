import { useEffect, useState, useSyncExternalStore } from "react";
import type { Operation } from "./db.js";
import { watchOutbox } from "./outbox.js";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function useOutbox(): Operation[] {
  const [ops, setOps] = useState<Operation[]>([]);
  useEffect(() => watchOutbox(setOps), []);
  return ops;
}
