export const dynamic = "force-dynamic";

/**
 * Señal de vida del sitio. No dice nada de nadie: solo que la web contesta.
 *
 * Existe para que la revisión de estado tenga contra qué comprobar la
 * plataforma sin pedir una página entera del panel — que además necesitaría
 * sesión y mediría otra cosa.
 */
export function GET() {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
