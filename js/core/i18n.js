// i18n.js — Minimal translation engine. No framework, just dot-path lookups
// into LOCALES plus a tiny pub/sub so any part of the UI can re-render when
// the language changes.
import { LOCALES } from "../data/locales.js";

const STORAGE_KEY = "ssf.lang";
const SUPPORTED = ["tr", "en"];

class I18n {
  constructor() {
    this._lang = this._detectInitialLanguage();
    this._listeners = new Set();
  }

  _detectInitialLanguage() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (e) { /* localStorage unavailable, ignore */ }
    const nav = (navigator.language || "tr").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(nav) ? nav : "tr";
  }

  get lang() {
    return this._lang;
  }

  setLanguage(lang) {
    if (!SUPPORTED.includes(lang) || lang === this._lang) return;
    this._lang = lang;
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.setAttribute("lang", lang);
    this._listeners.forEach((fn) => fn(lang));
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Resolve a dot-path like "assets.uploadHint" against the active locale,
   *  falling back to English, then to the raw key path if nothing matches. */
  t(path, params) {
    const fromLang = this._resolve(this._lang, path);
    const value = fromLang ?? this._resolve("en", path) ?? path;
    if (!params) return value;
    return Object.keys(params).reduce(
      (str, key) => str.replaceAll(`{{${key}}}`, String(params[key])),
      value
    );
  }

  _resolve(lang, path) {
    return path.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), LOCALES[lang]);
  }

  /** Applies translations to every element carrying data-i18n / data-i18n-placeholder
   *  / data-i18n-title attributes within `root` (defaults to the whole document). */
  applyTo(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = this.t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", this.t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", this.t(el.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", this.t(el.getAttribute("data-i18n-aria-label")));
    });
  }
}

export const i18n = new I18n();
