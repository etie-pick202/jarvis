import { useId } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

/** Choix exclusif (paiement, réception…) : de vrais boutons radio, navigables au clavier. */
export function Segmented<V extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segments">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="segments__option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
