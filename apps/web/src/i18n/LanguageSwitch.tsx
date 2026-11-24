import { Segmented } from "../ui/Segmented.js";
import { type Lang, useI18n } from "./index.js";

/** Disponible depuis chaque écran (règle d'affichage du cahier des charges). */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <Segmented<Lang>
      compact
      legend={t("lang.label")}
      value={lang}
      onChange={setLang}
      options={[
        { value: "fr", label: "FR" },
        { value: "en", label: "EN" },
      ]}
    />
  );
}
