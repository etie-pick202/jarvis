import type { ButtonHTMLAttributes } from "react";

type Variant = "jaune" | "noir" | "contour";

export function Button({
  variant = "jaune",
  block = false,
  type = "button",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  const classes = ["btn", variant === "jaune" ? "" : `btn--${variant}`, block ? "btn--bloc" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
