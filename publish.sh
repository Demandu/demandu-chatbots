#!/usr/bin/env bash
# Publica los cambios: ./publish.sh "mensaje del commit"
set -e
cd "$(dirname "$0")"
git add -A
git commit -m "${1:-Actualizar Demandu Chatbots}"
git push origin main
echo "✅ Publicado. Netlify construirá en ~1-2 min."
