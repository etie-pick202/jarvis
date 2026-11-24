import { type InputHTMLAttributes, useId } from "react";

export function Field({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="champ__saisie" {...rest} />
    </div>
  );
}
