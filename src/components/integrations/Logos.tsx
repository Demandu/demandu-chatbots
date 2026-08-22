/**
 * Logos de los servicios que se integran.
 *
 * VAN COMO SVG DENTRO DEL CÓDIGO, no como imágenes descargadas de internet:
 * una etiqueta `<img>` a un servidor ajeno se rompe el día que ese servidor
 * cambia la ruta, tarda en cargar, y de paso le cuenta a ese tercero quién está
 * mirando tu panel. Aquí pesan nada y no dependen de nadie.
 *
 * POR QUÉ NO EMOJIS: un 📅 no dice "Google Calendar", dice "calendario". El
 * cliente que busca una integración concreta la reconoce por su logo antes de
 * leer una sola palabra, y ver el logo real es lo que hace que una integración
 * parezca de verdad y no un placeholder.
 */

/** Google Calendar. Marco de cuatro colores con el 31, como el oficial. */
export function GoogleCalendarLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Google Calendar">
      <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#FFFFFF" />
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V8H3V6.5Z" fill="#4285F4" />
      <path d="M3 17h18v1.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5V17Z" fill="#34A853" />
      <path d="M3 8h3v9H3V8Z" fill="#EA4335" />
      <path d="M18 8h3v9h-3V8Z" fill="#FBBC04" />
      <text
        x="12"
        y="15.4"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#1A73E8"
      >
        31
      </text>
    </svg>
  );
}
