#!/usr/bin/env bash
# Corre todas las pruebas de la plataforma.
#   ./scripts/probar.sh
set -uo pipefail
cd "$(dirname "$0")/.."

FALLOS=0
NODE="node --experimental-strip-types --no-warnings scripts/pruebas/correr.mjs"

echo ""
echo "════════════════════════════════════════════"
echo "  PRUEBAS DE DEMANDU CHATBOTS"
echo "════════════════════════════════════════════"

for archivo in estatico logica negocio motor crm; do
  echo ""
  echo "── $archivo ──────────────────────────────"
  $NODE "scripts/pruebas/$archivo.mjs" || FALLOS=$((FALLOS+1))
done

echo ""
echo "════════════════════════════════════════════"
if [ "$FALLOS" -eq 0 ]; then
  echo "  ✅ TODO EN ORDEN"
else
  echo "  ❌ $FALLOS grupo(s) con fallos"
fi
echo "════════════════════════════════════════════"
echo ""
echo "El aislamiento entre clientes se prueba aparte, contra la base real."
echo "Pega estos dos archivos en el editor SQL de Supabase:"
echo "  scripts/pruebas/base-de-datos.sql"
echo "  scripts/pruebas/crm-base-de-datos.sql"
echo ""
exit $FALLOS
