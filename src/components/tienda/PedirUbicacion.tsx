"use client";

import { useState } from "react";
import { MapPin, Check, LoaderCircle } from "lucide-react";
import {
  comoRespuesta, leerUbicacion, enlaceDeMapa, porQueNoSirve,
  comoSeLeeLaPrecision, precisionDudosa,
} from "@/lib/tienda/ubicacion";
import { BuscarDireccion } from "@/components/BuscarDireccion";

/**
 * «¿DÓNDE TE LO LLEVAMOS?», SIN MAPA Y SIN LLAVE DE API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO HAY UN MAPA CON UN PIN QUE SE ARRASTRA.
 *
 * Porque un mapa dibujado exige un proveedor de mosaicos, y eso es una decisión
 * de dinero, no de diseño: Google cobra por cada vez que se pinta, y el mapa
 * gratis de OpenStreetMap tiene una política de uso que prohíbe justo el
 * volumen que tendría una tienda que venda. Tomar esa decisión a escondidas
 * dentro de un componente es como se acaba con una factura que nadie esperaba.
 *
 * Y RESULTA QUE PARA EL 90% DE LOS PEDIDOS NO HACE FALTA. El cliente pide desde
 * el teléfono, en su casa, a la que quiere que le lleven: un botón que pregunta
 * al GPS da la coordenada exacta de un toque, mejor que cualquier pin
 * arrastrado a ojo. El mapa hace falta para el otro caso —pedir desde la
 * oficina para que lo lleven a casa— y para ese está la casilla de pegar el
 * enlace de Google Maps, que es lo que esa gente ya hace hoy por WhatsApp.
 *
 * ── Y AHORA HAY UNA TERCERA PUERTA, QUE ES LA MÁS ANCHA ───────────────────
 *
 * Escribir la dirección y elegirla de una lista. Da el punto sin que el cliente
 * sepa que existe una coordenada, sin pedir permisos y sin salir de la tienda.
 * VA LA PRIMERA porque es la que entiende todo el mundo: «usar mi ubicación»
 * pide un permiso que mucha gente niega por costumbre, y pegar un enlace de
 * Google Maps solo lo sabe hacer quien ya lo hace.
 *
 * Las otras dos se quedan, y no por si acaso: el GPS es más exacto que
 * cualquier dirección cuando pides desde donde vas a recibir, y hay
 * direcciones en Panamá que Google sencillamente no conoce.
 *
 * ── LA CONFIRMACIÓN NO ES OPCIONAL ────────────────────────────────────────
 *
 * «Ubicación guardada ✓» y nada más es un acto de fe. El GPS de un teléfono
 * dentro de un edificio se equivoca por cuadras, y el cliente no se entera
 * hasta que la moto no aparece. Por eso siempre hay un enlace para MIRARLA, y
 * cuando el navegador admite que anda perdido, se dice.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function PedirUbicacion({
  valor,
  onCambio,
  estilo,
  acento,
}: {
  valor: string;
  onCambio: (v: string) => void;
  estilo: React.CSSProperties;
  acento: string;
}) {
  const [buscando, setBuscando] = useState(false);
  const [pegado, setPegado] = useState("");
  const [aviso, setAviso] = useState("");
  const [precision, setPrecision] = useState<number | null>(null);
  // Lo que escribe en el buscador. No es la respuesta: la respuesta sigue
  // siendo la coordenada. Esto solo es lo que se ve mientras busca.
  const [escrito, setEscrito] = useState("");

  const puesta = leerUbicacion(valor);

  function pedirAlNavegador() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAviso("Este navegador no sabe decir dónde estás. Pégame el enlace de Google Maps.");
      return;
    }
    setAviso("");
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        setPrecision(pos.coords.accuracy ?? null);
        onCambio(comoRespuesta({ lat: pos.coords.latitude, long: pos.coords.longitude }));
      },
      (err) => {
        setBuscando(false);
        // CADA MOTIVO TIENE SU FRASE. «No se pudo obtener la ubicación» deja al
        // cliente sin saber si es culpa suya, del permiso o del teléfono — y el
        // caso más común, con diferencia, es que le dijo que no al permiso.
        setAviso(
          err?.code === 1
            ? "No nos diste permiso para ver tu ubicación. Puedes darlo desde el candado de la barra de direcciones, o pegarme el enlace de Google Maps."
            : "No se pudo leer tu ubicación ahora mismo. Prueba otra vez, o pégame el enlace de Google Maps.",
        );
      },
      // SIN CACHÉ Y CON TOPE DE TIEMPO. `maximumAge` por defecto deja al
      // navegador devolver una ubicación vieja: la de la oficina, para un
      // pedido que se pide desde casa.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function usarLoPegado(texto: string) {
    setPegado(texto);
    if (!texto.trim()) { setAviso(""); return; }
    const u = leerUbicacion(texto);
    if (!u) { setAviso(porQueNoSirve(texto)); return; }
    setAviso("");
    setPrecision(null);
    onCambio(comoRespuesta(u));
  }

  return (
    <div className="grid gap-2">
      {puesta ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-sm" style={estilo}>
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: acento }}>
            <Check className="h-4 w-4" /> Ubicación lista
          </span>
          <a
            href={enlaceDeMapa(puesta)}
            target="_blank"
            rel="noreferrer"
            className="underline opacity-80"
          >
            Ver en el mapa
          </a>
          <button
            type="button"
            onClick={() => { onCambio(""); setPegado(""); setPrecision(null); setAviso(""); }}
            className="underline opacity-60"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          {/* ── LA PUERTA ANCHA VA PRIMERA ─────────────────────────────────
              Elegir de una lista lo sabe hacer cualquiera. El botón de abajo
              pide un permiso que mucha gente niega sin leerlo, y la casilla de
              pegar el enlace solo la usa quien ya lo hacía por WhatsApp. */}
          <BuscarDireccion
            valor={escrito}
            onCambio={setEscrito}
            onPunto={(punto) => {
              setEscrito(punto.direccion);
              setPrecision(null);
              setAviso("");
              onCambio(comoRespuesta({ lat: punto.lat, long: punto.long }));
            }}
            placeholder="Escribe tu dirección"
            estilo={estilo}
            acento={acento}
          />

          <p className="text-center text-xs opacity-50">o</p>

          <button
          type="button"
          onClick={pedirAlNavegador}
          disabled={buscando}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={estilo}
        >
          {buscando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {buscando ? "Buscando dónde estás…" : "Usar mi ubicación"}
          </button>
        </>
      )}

      {/* LA CASILLA NO DESAPARECE AL ACERTAR: quien ve que el pin quedó mal
          necesita poder pegar el bueno sin tener que borrar nada primero. */}
      <input
        type="text"
        value={pegado}
        onChange={(e) => usarLoPegado(e.target.value)}
        placeholder="o pega aquí tu enlace de Google Maps"
        className="w-full rounded-xl border px-3 py-2 text-sm"
        style={estilo}
      />

      {puesta && precisionDudosa(precision) && (
        <p className="text-xs opacity-70">{comoSeLeeLaPrecision(precision)}</p>
      )}
      {aviso && <p className="text-xs" style={{ color: "#dc2626" }}>{aviso}</p>}
    </div>
  );
}
