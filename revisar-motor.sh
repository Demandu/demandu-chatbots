#!/usr/bin/env bash
#
# ─────────────────────────────────────────────────────────────────────────────
# REVISAR EL MOTOR ANTES DE PUBLICARLO.
#
# El motor de WhatsApp es el ÚNICO código de la plataforma que se publica a
# ciegas. `supabase/functions/` no entra en el `tsc` del proyecto y no lo
# importa ninguna prueba: se despliega con `publicar-motor.sh` y el primero en
# enterarse de que está roto es un cliente escribiendo por WhatsApp.
#
# No es hipotético. El 8 de septiembre de 2026 se declaró `const AFIRMACIONES`
# sin saber que ya existía otro con ese nombre desde hacía meses. Dos constantes
# iguales en el mismo ámbito es un error de sintaxis: la función no carga y el
# bot deja de contestarle a TODOS los clientes a la vez.
#
# ── SE REVISA FUERA DE ESTA CARPETA, Y NO ES UN CAPRICHO ─────────────────────
#
# Deno quiere montar su propio `node_modules` y choca con el de Next:
#
#     error: File exists, symlink '.deno/next@14.2.15/node_modules/next'
#
# El motor no importa NINGÚN archivo del proyecto —es autónomo a propósito, por
# eso hay copias deliberadas de algunas funciones— así que se copia a una
# carpeta temporal y allí no hay con qué chocar.
#
# ── LÍNEA BASE: LA PUERTA FALLA POR LO NUEVO, NO POR LO VIEJO ────────────────
#
# El motor arrastra 20 avisos de tipos que son REALES —`conv` y `contact` pueden
# ser nulos y se usan sin comprobar— pero arreglarlos es un trabajo aparte, con
# sus pruebas, no algo que se hace de madrugada antes de publicar.
#
# Así que se apunta lo que hay hoy en `errores-conocidos.txt` y esto falla solo
# si aparece algo que no estaba. Es como se adopta una herramienta sobre código
# que ya existe sin parar todo — y sirve desde el primer día: aquel
# `AFIRMACIONES` duplicado habría sido un error NUEVO y habría fallado.
#
# ESA LISTA ES UNA DEUDA, NO UN PERMISO. Cada línea que se quita es un fallo
# menos que puede tumbar el motor un sábado.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"

MOTOR="supabase/functions/whatsapp/index.ts"
CONOCIDOS="supabase/functions/whatsapp/errores-conocidos.txt"
TMP="${TMPDIR:-/tmp}/chequeo-motor-demandu"

if [ ! -f "$MOTOR" ]; then
  echo "❌ No encuentro $MOTOR. ¿Estás en la carpeta del proyecto?"
  exit 1
fi

rm -rf "$TMP"; mkdir -p "$TMP"
cp "$MOTOR" "$TMP/index.ts"

echo "🔎 Revisando el motor de WhatsApp con Deno…"
echo "   (la primera vez descarga Deno y las dependencias; luego es rápido)"
echo ""

SALIDA=$(cd "$TMP" && npx --yes deno@latest check --node-modules-dir=auto index.ts 2>&1)
CODIGO=$?

# ── «NO PUDE COMPROBARLO» NO ES «ESTÁ MAL» ───────────────────────────────────
#
# Son dos cosas distintas y se arreglan de forma distinta. Decir «falló» ante un
# problema de red manda a buscar un error que no existe — y, peor, enseña a
# ignorar este script. La primera versión de esto se equivocó exactamente así:
# dijo «NO lo publiques» por una dependencia que no bajó.
if echo "$SALIDA" | grep -qiE "failed to load|failed to fetch|error sending request|dns error|connection (refused|closed)|proxy"; then
  echo "$SALIDA"
  echo ""
  echo "⚠️  NO PUDE COMPROBARLO: no se pudieron descargar las dependencias."
  echo "   Esto NO dice que el motor esté mal. Dice que no se pudo mirar."
  exit 2
fi

# ── SE QUITAN LOS COLORES ANTES DE LEER NADA ─────────────────────────────────
#
# Deno colorea su salida, y un color es un carácter invisible al principio de la
# línea. Buscar líneas que EMPIECEN por «TS» no encontraba ninguna: los veinte
# errores estaban ahí y el filtro devolvía cero.
#
# Eso guardó una línea base VACÍA, y con ella la puerta se quedó ciega — habría
# dejado pasar cualquier cosa diciendo «sin errores nuevos». Peor que no tener
# puerta: da tranquilidad falsa.
# `\x1b` NO lo entiende el sed de macOS. Con las comillas $'...' de bash se
# escribe el ESC de verdad, y eso sí lo entienden los dos.
LIMPIA=$(printf '%s\n' "$SALIDA" | sed $'s/\033\\[[0-9;]*[a-zA-Z]//g')

# La huella de un error es su CÓDIGO y su MENSAJE, sin el número de línea:
# mover una función arriba no puede convertir un error viejo en uno nuevo.
AHORA=$(printf '%s\n' "$LIMPIA" | grep -oE 'TS[0-9]+ \[ERROR\]: .*$' | sed 's/ \[ERROR\]:/:/' | sort | uniq -c | awk '{$1=$1};1' | sort)

# ── EL GUARDIÁN DEL GUARDIÁN ─────────────────────────────────────────────────
#
# Si Deno dice que falló y nosotros no encontramos ni un error, el que está roto
# es este script — no el motor. Callarse aquí es exactamente lo que convirtió la
# primera versión en una puerta ciega.
#
# Se falla RUIDOSAMENTE. Una comprobación que no puede fallar no está
# comprobando nada, y es peor que no tenerla porque nadie vuelve a mirarla.
if [ $CODIGO -ne 0 ] && [ -z "$AHORA" ]; then
  echo "$SALIDA"
  echo ""
  echo "❌ ESTE SCRIPT ESTÁ ROTO, no el motor."
  echo "   Deno terminó con error pero no supe leer ni uno solo. El formato de"
  echo "   su salida cambió y el filtro ya no casa. Arréglalo antes de fiarte"
  echo "   de esta puerta: tal y como está, dejaría pasar cualquier cosa."
  exit 3
fi

if [ "${1:-}" = "--aceptar" ]; then
  # Una línea base vacía es válida SOLO si el motor compila limpio. Si Deno se
  # quejó, guardar una lista vacía deja la puerta ciega para siempre.
  if [ -z "$AHORA" ] && [ $CODIGO -ne 0 ]; then
    echo "❌ Me niego a guardar una línea base vacía habiendo errores."
    exit 3
  fi
  printf '%s\n' "$AHORA" > "$CONOCIDOS"
  echo "📌 Línea base guardada en $CONOCIDOS"
  echo ""
  echo "$AHORA"
  echo ""
  echo "   A partir de ahora, esto falla si aparece un error que no esté en esa"
  echo "   lista. Cada línea que consigas quitar es un fallo menos que puede"
  echo "   tumbar el motor un sábado."
  exit 0
fi

if [ ! -f "$CONOCIDOS" ]; then
  echo "$SALIDA"
  echo ""
  echo "⚠️  No hay línea base todavía. Si has mirado lo de arriba y quieres"
  echo "   partir de ahí, corre:"
  echo ""
  echo "      ./revisar-motor.sh --aceptar"
  exit 2
fi

NUEVOS=$(diff <(sort "$CONOCIDOS") <(printf '%s\n' "$AHORA") | grep '^>' | sed 's/^> //')

if [ -z "$NUEVOS" ]; then
  if [ $CODIGO -eq 0 ]; then
    echo "✅ El motor compila, sin un solo aviso. Se puede publicar."
  else
    echo "✅ Sin errores nuevos. Se puede publicar."
    echo ""
    echo "   (siguen los conocidos de $CONOCIDOS — son deuda, no permiso)"
  fi
  exit 0
fi

echo "$SALIDA"
echo ""
echo "❌ HAY ERRORES QUE NO ESTABAN:"
echo ""
printf '%s\n' "$NUEVOS" | sed 's/^/   /'
echo ""
echo "   NO publiques el motor hasta mirarlos. Si la función no carga, WhatsApp"
echo "   deja de contestarle a todos los clientes a la vez."
echo ""
echo "   Si alguno es aceptable y quieres sumarlo a la línea base:"
echo "      ./revisar-motor.sh --aceptar"
exit 1
