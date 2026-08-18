cd /home/claude/demandu-chatbots
git fetch -q origin 2>&1 | head -3
echo "=== origin/main ==="
git log --oneline -3 origin/main
echo "=== ¿README ya tiene la sección del iPad en el remoto? ==="
git show origin/main:README.md 2>/dev/null | grep -c "Desarrollo desde el iPad" || echo "0"