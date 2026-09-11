#!/usr/bin/env bash
#
# ─────────────────────────────────────────────────────────────────────────────
# REVISAR LAS PANTALLAS ANTES DE PUBLICARLAS.
#
# LO QUE ESTO ARREGLA, Y CÓMO SE DESCUBRIÓ.
#
# El 10 de septiembre de 2026 `revisar-motor.sh` paró una publicación por un
# error de tipos mío: `pelado(texto)` recibía algo que podía ser nulo. La
# función vive DOS VECES —una copia en el motor de Deno y el original en
# `src/`— y el error estaba en las dos.
#
# Deno lo vio. `npm run build` llevaba días sin verlo.
#
# La causa está en `next.config`:
#
#     typescript: { ignoreBuildErrors: true }
#
# Con eso, el build de Next NO FALLA NUNCA por un error de tipos, y Netlify
# publica igual. `tsconfig.json` tiene `strict: true`, así que los errores
# existen y se escriben en pantalla — pero no paran nada, y en un build de
# Netlify no los lee nadie.
#
# Resultado: el motor de WhatsApp, que es la parte que se publica «a ciegas»,
# era la ÚNICA con puerta. Las pantallas —donde vive casi todo el código— no
# tenían ninguna.
#
# ── POR QUÉ NO SE QUITA `ignoreBuildErrors` Y YA ─────────────────────────────
#
# Porque hoy hay errores de verdad, y quitarlo dejaría la plataforma sin poder
# publicar hasta arreglarlos todos. Eso no se hace un jueves con clientes
# dentro. Esta puerta hace lo mismo sin bloquear: apunta lo que hay hoy y falla
# solo por lo NUEVO. Cuando la lista llegue a cero, se quita esa línea del
# `next.config` y esta puerta sobra.
#
# ── SOLO `src/`, Y NO ES PEREZA ──────────────────────────────────────────────
#
# `tsc` también mira `supabase/functions/`, y ahí se queja de `Deno` —que no
# conoce— con veintitantos errores que son mentira. Esa carpeta ya tiene su
# propia puerta, que la revisa con Deno de verdad: `revisar-motor.sh`. Mezclar
# las dos salidas llenaría esta lista de ruido, y una lista con ruido se deja
# de leer.
#
# ESA LISTA ES UNA DEUDA, NO UN PERMISO. Cada línea que se quita es un fallo
# menos que llega a producción sin que nadie lo vea.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"

TSC="node_modules/typescript/bin/tsc"
CONOCIDOS="scripts/pruebas/errores-de-tipos-conocidos.txt"

if [ ! -f "$TSC" ]; then
  echo "⚠️  NO PUDE COMPROBARLO: falta TypeScript en node_modules."
  echo "   Corre \`npm install\` y vuelve a intentarlo."
  echo ""
  echo "   Esto NO dice que las pantallas estén mal. Dice que no se pudo mirar."
  exit 2
fi

echo "🔎 Revisando los tipos de las pantallas…"
echo ""

SALIDA=$(node "$TSC" --noEmit 2>&1)
CODIGO=$?

# ── LA HUELLA DE UN ERROR ────────────────────────────────────────────────────
#
# Es su ARCHIVO, su código y su mensaje — sin el número de línea ni la columna.
# Añadir tres líneas arriba de un archivo no puede convertir un error viejo en
# uno nuevo: si contara la línea, cualquier cambio inocente pintaría la puerta
# de rojo y la puerta acabaría desactivada.
#
# El archivo SÍ se guarda: el mismo error en otro sitio es otro error.
AHORA=$(printf '%s\n' "$SALIDA" \
  | grep -E '^src/.*error TS[0-9]+:' \
  | sed -E 's/\([0-9]+,[0-9]+\): error /: /' \
  | sort -u)

# ── EL GUARDIÁN DEL GUARDIÁN ─────────────────────────────────────────────────
#
# Si `tsc` terminó mal y aquí no se leyó ni un error de `src/`, puede ser una de
# dos: que todo lo malo esté en `supabase/functions/` —normal, esa carpeta tiene
# su propia puerta— o que este filtro se haya quedado ciego porque cambió el
# formato de la salida.
#
# Se distinguen mirando si hubo ALGÚN error en cualquier sitio. Si `tsc` falló y
# no se leyó ninguno en ningún lado, el roto es este script.
CUALQUIERA=$(printf '%s\n' "$SALIDA" | grep -cE 'error TS[0-9]+:')
if [ "$CODIGO" -ne 0 ] && [ "$CUALQUIERA" -eq 0 ]; then
  echo "$SALIDA"
  echo ""
  echo "❌ ESTE SCRIPT ESTÁ ROTO, no las pantallas."
  echo "   \`tsc\` terminó con error pero no supe leer ni uno solo. Cambió el"
  echo "   formato de su salida y el filtro ya no casa. Arréglalo antes de"
  echo "   fiarte de esta puerta: tal y como está, dejaría pasar cualquier cosa."
  exit 3
fi

if [ "${1:-}" = "--aceptar" ]; then
  printf '%s\n' "$AHORA" > "$CONOCIDOS"
  N=$(printf '%s\n' "$AHORA" | grep -c . || true)
  echo "📌 Línea base guardada en $CONOCIDOS ($N)"
  echo ""
  printf '%s\n' "$AHORA" | sed 's/^/   /'
  echo ""
  echo "   A partir de ahora esto falla si aparece un error que no esté ahí."
  echo "   Cada línea que consigas quitar es un fallo menos que llega a"
  echo "   producción sin que nadie lo vea."
  exit 0
fi

if [ ! -f "$CONOCIDOS" ]; then
  printf '%s\n' "$AHORA"
  echo ""
  echo "⚠️  No hay línea base todavía. Si has mirado lo de arriba y quieres"
  echo "   partir de ahí, corre:"
  echo ""
  echo "      ./revisar-pantallas.sh --aceptar"
  exit 2
fi

NUEVOS=$(diff <(sort -u "$CONOCIDOS") <(printf '%s\n' "$AHORA") | grep '^>' | sed 's/^> //')

if [ -z "$NUEVOS" ]; then
  RESTAN=$(grep -c . "$CONOCIDOS" || true)
  if [ "$RESTAN" -eq 0 ]; then
    echo "✅ Las pantallas compilan, sin un solo aviso."
    echo ""
    echo "   La lista está a cero: ya se puede quitar \`ignoreBuildErrors\` del"
    echo "   next.config y que el propio build sea la puerta."
  else
    echo "✅ Sin errores de tipos nuevos en src/."
    echo ""
    echo "   (siguen $RESTAN conocidos en $CONOCIDOS — son deuda, no permiso)"
  fi
  exit 0
fi

echo "❌ HAY ERRORES DE TIPOS QUE NO ESTABAN:"
echo ""
printf '%s\n' "$NUEVOS" | sed 's/^/   /'
echo ""
echo "   El build de Next NO va a fallar por esto —lo tiene desactivado— así"
echo "   que si no los miras aquí, no los mira nadie y se publican."
echo ""
echo "   Si alguno es aceptable y quieres sumarlo a la línea base:"
echo "      ./revisar-pantallas.sh --aceptar"
exit 1
