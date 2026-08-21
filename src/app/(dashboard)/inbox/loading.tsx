/**
 * Esqueleto propio de la Bandeja.
 *
 * El genérico del panel no sirve aquí: la Bandeja no es una página que se
 * desplaza, son tres columnas a pantalla completa. Con el esqueleto genérico
 * el salto de layout se notaba más que la espera.
 */
export default function CargandoBandeja() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la bandeja…</span>

      {/* Lista de conversaciones */}
      <div className="flex w-[320px] flex-none flex-col gap-3 border-r border-surface-border bg-surface p-3">
        <div className="h-9 animate-pulse rounded-lg bg-surface-raised" />
        <div className="h-7 animate-pulse rounded-lg bg-surface-raised" style={{ animationDelay: "60ms" }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-2" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="h-9 w-9 flex-none animate-pulse rounded-full bg-surface-raised" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-raised" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
            </div>
          </div>
        ))}
      </div>

      {/* La charla: burbujas alternadas, para que se lea como un chat */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#eae6df]">
        <div className="h-[58px] flex-none border-b border-surface-border bg-surface" />
        <div className="flex flex-1 flex-col gap-2 p-6">
          {[
            { out: false, w: "42%" },
            { out: true, w: "56%" },
            { out: false, w: "34%" },
            { out: true, w: "48%" },
          ].map((f, i) => (
            <div
              key={i}
              className={`h-9 animate-pulse rounded-lg bg-white/60 ${f.out ? "self-end" : "self-start"}`}
              style={{ width: f.w, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        {/* Mismo guiño que en el resto del panel: solo asoma si de verdad tarda. */}
        <p className="pb-3 select-none text-center text-sm text-[#6b6f8a] [animation:respira_.5s_ease-out_.9s_both]">
          inhala, exhala 😮‍💨
        </p>
        <style>{`@keyframes respira { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>

        <div className="h-[62px] flex-none bg-white" />
      </div>
    </div>
  );
}
