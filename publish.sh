#!/usr/bin/env bash
# Publica los cambios: ./publish.sh "mensaje del commit"
#
# POR QUÉ NO ES UN `set -e` A SECAS: la versión anterior abortaba cuando no
# había nada que commitear, y se salía ANTES del push. Si un commit ya estaba
# hecho pero sin subir, el sitio se quedaba viejo y el script decía "nothing to
# commit" como si todo estuviera bien. Ahora el push se intenta siempre.
set -uo pipefail
cd "$(dirname "$0")"

# Un `git commit` que se cortó deja .git/index.lock y bloquea TODO. Sin este
# aviso, `git add` falla, no se guarda nada, y el script sigue como si nada
# hasta decir "todo publicado". Pasó de verdad el 20 ago 2026.
if [ -f .git/index.lock ]; then
  echo "⚠️  Hay un candado de git de una operación anterior que se cortó:"
  echo "      $(pwd)/.git/index.lock"
  echo ""
  echo "   Si NO tienes ningún git abierto en otra ventana, quítalo con:"
  echo "      rm .git/index.lock"
  echo "   y vuelve a correr ./publish.sh"
  exit 1
fi

if ! git add -A; then
  echo "❌ 'git add' falló. No se subió nada. Arriba está el motivo."
  exit 1
fi

if git diff --cached --quiet; then
  echo "ℹ️  No hay cambios nuevos que guardar."
else
  git commit -m "${1:-Actualizar Demandu Chatbots}" || {
    echo "❌ No se pudo guardar el commit. Arriba está el motivo."
    exit 1
  }
fi

# Aunque no hubiera cambios nuevos, puede haber commits sin subir.
PENDIENTES=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
if [ "$PENDIENTES" = "0" ]; then
  echo "✅ Todo estaba ya publicado. Nada que subir."
  exit 0
fi

echo "⬆️  Subiendo $PENDIENTES commit(s)…"
if git push origin main; then
  echo ""
  echo "✅ Publicado. Netlify construirá en ~1-2 min."
  echo "   Míralo aquí: https://app.netlify.com/projects/demandu-chatbots/deploys"
else
  echo ""
  echo "❌ El push falló. Lo más común:"
  echo "   • Te pide usuario/contraseña de GitHub → necesitas un token, no la contraseña."
  echo "   • Dice 'rejected' → alguien más subió algo: corre  git pull --rebase  y vuelve a intentar."
  exit 1
fi
