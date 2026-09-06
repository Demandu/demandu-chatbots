/** Idiomas para el traductor del chat, con su bandera para reconocerlos de un vistazo. */
export type Idioma = { code: string; nombre: string; bandera: string };

export const IDIOMAS: Idioma[] = [
  { code: "es", nombre: "Español", bandera: "🇪🇸" },
  { code: "en", nombre: "Inglés", bandera: "🇺🇸" },
  { code: "pt", nombre: "Portugués", bandera: "🇧🇷" },
  { code: "fr", nombre: "Francés", bandera: "🇫🇷" },
  { code: "de", nombre: "Alemán", bandera: "🇩🇪" },
  { code: "it", nombre: "Italiano", bandera: "🇮🇹" },
  { code: "nl", nombre: "Neerlandés", bandera: "🇳🇱" },
  { code: "ru", nombre: "Ruso", bandera: "🇷🇺" },
  { code: "uk", nombre: "Ucraniano", bandera: "🇺🇦" },
  { code: "pl", nombre: "Polaco", bandera: "🇵🇱" },
  { code: "tr", nombre: "Turco", bandera: "🇹🇷" },
  { code: "ar", nombre: "Árabe", bandera: "🇸🇦" },
  { code: "he", nombre: "Hebreo", bandera: "🇮🇱" },
  { code: "hi", nombre: "Hindi", bandera: "🇮🇳" },
  { code: "bn", nombre: "Bengalí", bandera: "🇧🇩" },
  { code: "ur", nombre: "Urdu", bandera: "🇵🇰" },
  { code: "zh", nombre: "Chino", bandera: "🇨🇳" },
  { code: "ja", nombre: "Japonés", bandera: "🇯🇵" },
  { code: "ko", nombre: "Coreano", bandera: "🇰🇷" },
  { code: "id", nombre: "Indonesio", bandera: "🇮🇩" },
  { code: "ms", nombre: "Malayo", bandera: "🇲🇾" },
  { code: "th", nombre: "Tailandés", bandera: "🇹🇭" },
  { code: "vi", nombre: "Vietnamita", bandera: "🇻🇳" },
  { code: "tl", nombre: "Filipino", bandera: "🇵🇭" },
  { code: "sw", nombre: "Suajili", bandera: "🇰🇪" },
  { code: "el", nombre: "Griego", bandera: "🇬🇷" },
  { code: "sv", nombre: "Sueco", bandera: "🇸🇪" },
  { code: "no", nombre: "Noruego", bandera: "🇳🇴" },
  { code: "da", nombre: "Danés", bandera: "🇩🇰" },
  { code: "fi", nombre: "Finés", bandera: "🇫🇮" },
  { code: "cs", nombre: "Checo", bandera: "🇨🇿" },
  { code: "hu", nombre: "Húngaro", bandera: "🇭🇺" },
  { code: "ro", nombre: "Rumano", bandera: "🇷🇴" },
  { code: "ca", nombre: "Catalán", bandera: "🏴" },
];

export const idiomaPorCodigo = (code?: string | null) =>
  IDIOMAS.find((i) => i.code === code) ?? null;
