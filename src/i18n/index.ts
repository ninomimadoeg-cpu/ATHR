import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Site screens default to Arabic, manager screens to English. Western digits in both.
const resources = {
  en: { translation: { appName: "Site Progress", comingSoon: "The app is being built. Your progress maths is already tested.", language: "عربي" } },
  ar: { translation: { appName: "تقدم الموقع", comingSoon: "التطبيق قيد الإنشاء.", language: "English" } },
};

export function setLanguage(lng: "ar" | "en") {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
  try { localStorage.setItem("sp-lang", lng) } catch { /* private mode */ }
}

let saved: "ar" | "en" = "ar";
try { saved = localStorage.getItem("sp-lang") === "en" ? "en" : "ar" } catch { /* private mode */ }

void i18n.use(initReactI18next).init({ resources, lng: saved, fallbackLng: "en", interpolation: { escapeValue: false } });
document.documentElement.lang = saved;
document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";

export default i18n;
