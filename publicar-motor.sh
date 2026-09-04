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
# ── LO QUE HACE FALTA UNA SOLA VEZ ────────────────────────────────────────
#
# Un token de Supabase, que se saca aquí:
#     https://supabase.com/dashboard/account/tokens
#
# y se guarda en la Mac (una vez, no en el repositorio):
#     echo 'export SUPABASE_ACCESS_TOKEN=sbp_...' >> ~/.zshrc
#     source ~/.zshrc
#
# NO VA EN EL REPOSITORIO. Un token en un archivo del proyecto acaba en GitHub,
# y con él se entra a todos los proyectos de Supabase de la cuenta.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"

PROYECTO="${SUPABASE_PROJECT_REF:-stgedtcsuyypzjbxcpoe}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "❌ Falta el token de Supabase, así que el motor NO se publicó."
  echo ""
  echo "   Sácalo una sola vez aquí:"
  echo "      https://supabase.com/dashboard/account/tokens"
  echo "   y guárdalo en tu Mac con:"
  echo "      echo 'export SUPABASE_ACCESS_TOKEN=sbp_loQueTeDenAlli' >> ~/.zshrc"
  echo "      source ~/.zshrc"
  echo ""
  echo "   Después vuelve a correr:  ./publicar-motor.sh"
  exit 1
fi

echo "⬆️  Publicando el motor de WhatsApp en Supabase…"

# --no-verify-jwt NO ES UN DESCUIDO: quien llama es Meta, que no tiene sesión de
# Supabase. La puerta la guarda la firma del webhook (`X-Hub-Signature-256`), no
# un JWT. Si se publicara con verificación, Meta recibiría 401 en cada mensaje y
# el bot se quedaría mudo para todos los clientes a la vez.
if npx --yes supabase@latest functions deploy whatsapp \
     --project-ref "$PROYECTO" --no-verify-jwt; then
  echo ""
  echo "✅ Motor publicado. Los bloques nuevos ya funcionan en WhatsApp."
else
  echo ""
  echo "❌ No se pudo publicar el motor. Lo más común:"
  echo "   • El token caducó o es de otra cuenta → saca uno nuevo."
  echo "   • No hay internet o Supabase está caído."
  exit 1
fi
