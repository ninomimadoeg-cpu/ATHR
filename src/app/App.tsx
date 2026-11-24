import { useTranslation } from "react-i18next";
import { setLanguage } from "../i18n";

export function App() {
  const { t, i18n } = useTranslation();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex items-center gap-3">
        <span className="inline-block h-3.5 w-3.5 border-2 border-ink bg-mint" />
        <h1 className="me-auto text-xl font-bold">{t("appName")}</h1>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-gray-300 px-3"
          onClick={() => setLanguage(i18n.language === "ar" ? "en" : "ar")}
        >
          {t("language")}
        </button>
      </header>
      <p className="mt-6 text-gray-600">{t("comingSoon")}</p>
    </main>
  );
}
