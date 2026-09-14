import { ElegirIdioma } from "@/components/settings/ElegirIdioma";
import { idiomaDeLaSesion } from "@/i18n/sesion";

export const dynamic = "force-dynamic";

export default async function PantallaDeIdioma() {
  // El idioma vigente se resuelve en el servidor, con la misma función que usa
  // el resto del panel: la pantalla no puede enseñar uno distinto del que está
  // aplicándose.
  const actual = await idiomaDeLaSesion();
  return <ElegirIdioma actual={actual} />;
}
