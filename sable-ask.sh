#!/usr/bin/env bash
# Sable's front door to the Reading Room.
#
# Ask a question; Amina answers GROUNDED in the local 514-book library, citing
# the books by title. Nothing leaves the machine unless you ask: prefix a line
# with `web:` to let her consult the labeled web too. This is "Wikipedia but
# better" — your curated canon, offline, cited, no tracking.
#
#   ./sable-ask.sh                 # interactive REPL (click Sable opens this)
#   ./sable-ask.sh "a question"    # one-shot, then exit
#   ./sable-ask.sh web: "a query"  # one-shot, allow labeled web
#
# Amina lives outside this repo; we find her rather than hard-code a path (it
# has moved before). Override with SABLE_AMINA=/path/to/amina_library.py.
set -uo pipefail

PY="${PYTHON:-python3}"

find_amina() {
  local cands=(
    "${SABLE_AMINA:-}"
    "$HOME/Desktop/Folders/Sanctuary/library/amina_library.py"
    "$HOME/Desktop/Sanctuary/library/amina_library.py"
  )
  local p
  for p in "${cands[@]}"; do
    [ -n "$p" ] && [ -f "$p" ] && { printf '%s\n' "$p"; return 0; }
  done
  # Last resort: search the home tree (bounded depth), first hit wins.
  find "$HOME" -maxdepth 6 -name amina_library.py 2>/dev/null | head -1
}

AMINA="$(find_amina)"
if [ -z "$AMINA" ]; then
  echo "◕ᴥ◕  Sable: I can't find Amina (amina_library.py)."
  echo "      Point me at her:  SABLE_AMINA=/path/to/amina_library.py $0"
  exit 1
fi

# Friendly heads-up if the model server is down — grounded retrieval still works
# for raw sources, but phrased answers need Ollama.
ollama_up() {
  command -v curl >/dev/null 2>&1 || return 0   # can't check; assume ok
  curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1
}

ask() {
  local q="$1"
  case "$q" in
    web:*) "$PY" "$AMINA" --web "${q#web:}" ;;
    *)     "$PY" "$AMINA" "$q" ;;
  esac
}

# One-shot mode: everything after the script name is the question.
if [ "$#" -gt 0 ]; then
  ask "$*"
  exit $?
fi

# Interactive REPL.
if ! ollama_up; then
  echo "⚠  Ollama isn't answering on :11434 — start it with:  ollama serve"
  echo "   (Grounded retrieval works; phrased answers need the model.)"
  echo
fi
echo "◕ᴥ◕  Sable's Reading Room. Ask me anything — I answer from the library."
echo "      Prefix with 'web:' to allow the labeled web. Ctrl-D or 'exit' to go."
while IFS= read -e -r -p $'\n◕ᴥ◕  ask Sable › ' q; do
  case "$q" in
    ""|$'\n') continue ;;
    exit|quit|q) break ;;
    *) ask "$q" ;;
  esac
done
echo $'\n◕ᴥ◕  released. bye.'
