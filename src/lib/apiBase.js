// The frontend and backend are deployed separately in production.
// Keep localhost available for local development, but automatically use the
// Railway API when the Vite build is running in production and no env override
// was provided.
const RAILWAY_API_URL = "https://hgfh-production-f1fd.up.railway.app";
const configuredApiBase = String(import.meta.env.VITE_API_URL || "").trim();

export const API_BASE = (
  configuredApiBase || (import.meta.env.DEV ? "" : RAILWAY_API_URL)
).replace(/\/$/, "");

export function apiUrl(path = "") {
  const value = String(path || "");
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE}${value.startsWith("/") ? value : `/${value}`}`;
}
