/**
 * Lo que se ve mientras carga cualquier pantalla del panel.
 *
 * EL PROBLEMA QUE RESUELVE: todas las pantallas son dinámicas (`force-dynamic`)
 * porque leen datos del cliente con su sesión. En el App Router eso significa
 * que al hacer clic en "Embudo" el navegador se queda en la pantalla ANTERIOR
 * hasta que el servidor termina de consultar la base. Nada se mueve. El clic
 * parece no haber funcionado, y la gente vuelve a hacer clic.
 *
 * Con este archivo, Next pinta esto en cuanto tocas el menú: la pantalla cambia
 * al instante y los datos entran cuando llegan. No acelera el servidor — acelera
 * lo que se siente, que es lo que se estaba rompiendo.
 */
export default function Cargando() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-canvas p-4 sm:p-6 lg:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      {/* Título */}
      <div className="mb-6 space-y-2.5">
        <div className="h-7 w-52 animate-pulse rounded-lg bg-[#e6e8f2]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[#eef0f7]" />
      </div>

      {/* Fila de tarjetas: sirve igual para Resultados, Embudo o Contactos */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-[#e6e8f2] bg-white"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Bloque grande de contenido */}
      <div className="h-64 animate-pulse rounded-2xl border border-[#e6e8f2] bg-white" style={{ animationDelay: "320ms" }} />

      <Respira />
    </div>
  );
}

/**
 * El guiño de Lana mientras se espera.
 *
 * Arranca invisible y solo aparece a los 900 ms (`both` mantiene el opacity 0
 * durante la espera). Si la pantalla carga rápido —que es a lo que aspiramos—
 * nunca se llega a ver. Un chiste que sale en CADA clic deja de tener gracia
 * al tercero; uno que sale solo cuando de verdad tardas, acompaña.
 */
export function Respira() {
  return (
    <>
      <p className="mt-6 select-none text-center text-sm text-ink-3 [animation:respira_.5s_ease-out_.9s_both]">
        inhala, exhala 😮‍💨
      </p>
      <style>{`@keyframes respira { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>
    </>
  );
}
