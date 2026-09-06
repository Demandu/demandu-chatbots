#!/usr/bin/env bash
# Publica el MOTOR de WhatsApp (la función de Supabase).
#
# ─────────────────────────────────────────────────────────────────────────────
# POR QUÉ EXISTE ESTE SCRIPT, Y POR QUÉ COSTÓ UNA DEMO.
#
# Esta plataforma se publica en DOS SITIOS distintos y hasta hoy solo se
# publicaba uno:
#
#   · Las pantallas (todo `src/`) → GitHub → Netlify.  Eso lo hace publish.sh.
#   · El motor de WhatsApp (`supabase/functions/whatsapp`) → Supabase.  Eso NO
#     lo hacía nadie.
#
# El resultado: los bloques nuevos aparecían en el constructor, se podían
# arrastrar al flujo y se guardaban bien… y en WhatsApp no hacían nada. El
# motor que estaba corriendo era de semanas atrás y no conocía ese bloque, así
# que el flujo se quedaba sin salida, el cliente sin respuesta, y la red de
# seguridad lo pasaba con una persona. Todo «funcionaba» y nada funcionaba.
#
# Pasó el 4 de septiembre de 2026 probando el bloque «Mi tienda» en vivo.
#
# ── CÓMO SE IDENTIFICA, Y POR QUÉ NO CON UN TOKEN A MANO ──────────────────
#
# Se intentó primero con `SUPABASE_ACCESS_TOKEN` y NO FUNCIONA: los tokens que
# el panel de Supabase entrega hoy tienen un formato nuevo (45 caracteres, con
# mayúsculas) y el CLI todavía exige el viejo (44, solo 0-9 y a-f). Rechaza
# incluso los que el propio panel llama «legacy», con este error:
#
#     Invalid access token format. Must be like `sbp_0102...1920`.
#
# Así que la sesión la abre el propio CLI con `supabase login`: se identifica en
# el navegador y se guarda su credencial en `~/.supabase`. Es lo mismo que ya
# había pasado antes — los tokens `cli_...` que aparecen en la cuenta salieron
# de ahí.
#
# LA VARIABLE SE RESPETA SI ESTÁ. Un día el CLI aceptará el formato nuevo, o
# hará falta publicar desde un servidor sin navegador; ese caso sigue cubierto.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"

PROYECTO="${SUPABASE_PROJECT_REF:-stgedtcsuyypzjbxcpoe}"

# UN TOKEN CON EL FORMATO NUEVO ESTORBA EN VEZ DE AYUDAR: el CLI lo prefiere
# sobre la sesión guardada y falla, aunque `supabase login` esté hecho. Se
# ignora aquí en vez de pedirle a nadie que se acuerde de borrarlo.
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  if ! printf '%s' "$SUPABASE_ACCESS_TOKEN" | grep -qE '^sbp_(oauth_)?[0-9a-f]{40}$'; then
    echo "ℹ️  Tu SUPABASE_ACCESS_TOKEN tiene el formato nuevo, que el CLI todavía no"
    echo "   acepta. Lo ignoro y uso la sesión de 'supabase login'."
    unset SUPABASE_ACCESS_TOKEN
  fi
fi

echo "⬆️  Publicando el motor de WhatsApp en Supabase…"

# --no-verify-jwt NO ES UN DESCUIDO: quien llama es Meta, que no tiene sesión de
# Supabase. La puerta la guarda la firma del webhook (`X-Hub-Signature-256`), no
# un JWT. Si se publicara con verificación, Meta recibiría 401 en cada mensaje y
# el bot se quedaría mudo para todos los clientes a la vez.
SALIDA=$(npx --yes supabase@latest functions deploy whatsapp \
           --project-ref "$PROYECTO" --no-verify-jwt 2>&1)
CODIGO=$?
echo "$SALIDA"

if [ $CODIGO -eq 0 ]; then
  echo ""
  echo "✅ Motor publicado. Los bloques nuevos ya funcionan en WhatsApp."
  exit 0
fi

echo ""
# SE DISTINGUE «NO ESTÁS IDENTIFICADO» DE «FALLÓ LA PUBLICACIÓN». Los dos
# terminan igual de mal y se arreglan de forma completamente distinta; decir
# solo «no se pudo» es mandar a alguien a adivinar.
if echo "$SALIDA" | grep -qiE "access token|not logged in|login|unauthorized|401"; then
  echo "❌ No estás identificado en Supabase. Es una sola vez:"
  echo ""
  echo "      npx --yes supabase@latest login"
  echo ""
  echo "   Se abre el navegador, le das «Authorize», y vuelves a correr:"
  echo "      ./publicar-motor.sh"
else
  echo "❌ No se pudo publicar el motor. Arriba está el motivo exacto."
  echo "   Si no se entiende, corre esto y mándame lo que salga:"
  echo "      npx --yes supabase@latest functions deploy whatsapp \\"
  echo "        --project-ref $PROYECTO --no-verify-jwt --debug"
fi
exit 1
