import { formatFcfa, pickupTotal } from "@jarvis/shared";

export function App() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>JARVIS</h1>
      <p>Votre assistant, partout où vous allez.</p>
      <p>1 bouteille au comptoir : {formatFcfa(pickupTotal(1))}</p>
    </main>
  );
}
