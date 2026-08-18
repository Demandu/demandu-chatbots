/**
 * De un teléfono internacional saca el país (ISO-2) y su bandera.
 * Se usa para mostrar de dónde nos escribe el lead, sin pedirle nada.
 *
 * Nota: los prefijos se prueban del más largo al más corto, porque
 * +1 (EE. UU.) y +1809 (República Dominicana) comparten inicio.
 */

const PREFIJOS: Record<string, string> = {
  // Norteamérica y Caribe (comparten el +1)
  "1787": "PR", "1939": "PR", "1809": "DO", "1829": "DO", "1849": "DO",
  "1876": "JM", "1868": "TT", "1345": "KY", "1242": "BS",
  "1": "US",
  // Latinoamérica
  "52": "MX", "54": "AR", "55": "BR", "56": "CL", "57": "CO", "58": "VE",
  "51": "PE", "593": "EC", "591": "BO", "595": "PY", "598": "UY", "597": "SR",
  "592": "GY", "594": "GF",
  "502": "GT", "503": "SV", "504": "HN", "505": "NI", "506": "CR", "507": "PA",
  "501": "BZ", "509": "HT", "53": "CU",
  // Europa
  "34": "ES", "351": "PT", "33": "FR", "39": "IT", "49": "DE", "44": "GB",
  "31": "NL", "32": "BE", "41": "CH", "43": "AT", "46": "SE", "47": "NO",
  "45": "DK", "358": "FI", "353": "IE", "48": "PL", "30": "GR", "40": "RO",
  "420": "CZ", "36": "HU", "380": "UA", "7": "RU", "90": "TR",
  // Resto del mundo (los más frecuentes)
  "212": "MA", "20": "EG", "27": "ZA", "234": "NG", "254": "KE",
  "91": "IN", "86": "CN", "81": "JP", "82": "KR", "62": "ID", "63": "PH",
  "60": "MY", "65": "SG", "66": "TH", "84": "VN", "61": "AU", "64": "NZ",
  "972": "IL", "971": "AE", "966": "SA", "974": "QA", "965": "KW",
};

const ORDENADOS = Object.keys(PREFIJOS).sort((a, b) => b.length - a.length);

/** Devuelve el código ISO-2 del país, o null si no lo reconocemos. */
export function paisDesdeTelefono(phone?: string | null): string | null {
  const n = String(phone ?? "").replace(/\D/g, "");
  if (!n) return null;
  for (const p of ORDENADOS) if (n.startsWith(p)) return PREFIJOS[p];
  return null;
}

/** Convierte "MX" en 🇲🇽 (emoji de bandera). */
export function bandera(iso?: string | null): string {
  const c = String(iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🏳️";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Nombre del país en español, con respaldo al propio código. */
export function nombrePais(iso?: string | null): string {
  const c = String(iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "—";
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}
