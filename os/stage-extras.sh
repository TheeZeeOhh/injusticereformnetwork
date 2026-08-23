#!/bin/sh
# Stage the companion apps that live in their OWN repos into this image's
# includes.chroot, the same way the Sanctuary .deb is staged before a build.
#
# WHY A SCRIPT AND NOT A VENDORED COPY: Sanctuary Terminal is a separate project
# with its own repo, venv and test suite. Committing a snapshot of it here would
# fork it — the copy would drift, and a bug fixed upstream would live on in the
# ISO. So the source is copied in at build time from wherever it actually lives,
# and the staged copy is gitignored.
#
#   ./os/stage-extras.sh                     # use the default locations
#   TERMINAL_SRC=/path/to/terminal ./os/stage-extras.sh
#   ZEEZEE_SRC=/path/to/code ./os/stage-extras.sh
#   SKIP_OLLAMA=1 ./os/stage-extras.sh       # leave the 2.2G model store out
#
# Run this before build-in-container.sh. Re-running is safe (it replaces).
set -eu

cd "$(dirname "$0")"
OS_DIR="$(pwd -P)"
DEST_ROOT="$OS_DIR/config/includes.chroot"

TERMINAL_SRC="${TERMINAL_SRC:-$HOME/vault/Desktop/Folders/Sanctuary/terminal}"
TERMINAL_DEST="$DEST_ROOT/opt/sanctuary-terminal"

if [ ! -f "$TERMINAL_SRC/sanctuary_term.py" ]; then
	echo "stage-extras: no Sanctuary Terminal at $TERMINAL_SRC" >&2
	echo "              set TERMINAL_SRC=/path/to/terminal and re-run." >&2
	exit 1
fi

echo "staging Sanctuary Terminal from $TERMINAL_SRC"
rm -rf "$TERMINAL_DEST"
mkdir -p "$TERMINAL_DEST"

# Copy only what the app needs at runtime. Excluded on purpose:
#   .venv/       the image uses Debian's python3-pyqt5 + python3-pyte instead of
#                a venv built against another distro's Python — a venv copied
#                from Garuda would point at an interpreter that isn't there.
#   tests/       ~200K of test suite with no runtime role.
#   __pycache__/ bytecode compiled by a different Python version.
#   .git/        history does not belong in a squashfs.
for item in sanctuary_term.py sanctuary.bashrc irn-logo.ans irn-logo.png \
            sanctuary-icon.png sanctuary-icon-128.png README.md; do
	[ -e "$TERMINAL_SRC/$item" ] && cp -a "$TERMINAL_SRC/$item" "$TERMINAL_DEST/"
done

echo "staged -> ${TERMINAL_DEST#"$OS_DIR"/} ($(du -sh "$TERMINAL_DEST" | cut -f1))"

# ---------------------------------------------------------------------------
# Zee Zee (the AI twin widget) + its local Ollama brain.
# ---------------------------------------------------------------------------
ZEEZEE_SRC="${ZEEZEE_SRC:-$HOME/vault/Desktop/code}"
ZEEZEE_DEST="$DEST_ROOT/opt/zee-zee"

if [ -f "$ZEEZEE_SRC/ai_twin_widget.py" ]; then
	echo "staging Zee Zee from $ZEEZEE_SRC"
	rm -rf "$ZEEZEE_DEST"
	mkdir -p "$ZEEZEE_DEST"
	# Only the Python app. Excluded: ai_twin_app/ (a separate Tauri build with
	# ~5G of node_modules) and __pycache__ (bytecode from another Python).
	for f in "$ZEEZEE_SRC"/*.py "$ZEEZEE_SRC"/Modelfile.ai-twin; do
		[ -e "$f" ] && cp -a "$f" "$ZEEZEE_DEST/"
	done
	if [ -d "$ZEEZEE_SRC/plugins" ]; then
		mkdir -p "$ZEEZEE_DEST/plugins"
		for f in "$ZEEZEE_SRC"/plugins/*.py; do
			[ -e "$f" ] && cp -a "$f" "$ZEEZEE_DEST/plugins/"
		done
	fi
	echo "staged -> ${ZEEZEE_DEST#"$OS_DIR"/} ($(du -sh "$ZEEZEE_DEST" | cut -f1))"
else
	echo "stage-extras: no Zee Zee at $ZEEZEE_SRC — skipping" >&2
fi

if [ -z "${SKIP_OLLAMA:-}" ]; then
	# Ollama runtime. Taken from this host's install rather than downloaded, so a
	# build needs no network for it and matches the version you already run.
	#
	# GPU BACKENDS ARE DELIBERATELY OMITTED: cuda_v12 (1.2G), cuda_v13 (807M) and
	# rocm_v7_2 (2.6G) would add 4.6G to a live image for hardware most machines
	# booting a USB stick will not have. The CPU backends plus vulkan/ (98M total)
	# cover AMD and Intel GPUs through mesa, and CPU inference everywhere else.
	OLLAMA_BIN="${OLLAMA_BIN:-/usr/local/bin/ollama}"
	OLLAMA_LIB="${OLLAMA_LIB:-/usr/local/lib/ollama}"
	MODELS_SRC="$OS_DIR/staging/ollama-models"

	if [ -x "$OLLAMA_BIN" ] && [ -d "$OLLAMA_LIB" ]; then
		echo "staging Ollama runtime (CPU + vulkan backends only)"
		mkdir -p "$DEST_ROOT/usr/local/bin" "$DEST_ROOT/usr/local/lib/ollama"
		cp -a "$OLLAMA_BIN" "$DEST_ROOT/usr/local/bin/ollama"
		rm -rf "$DEST_ROOT/usr/local/lib/ollama"
		mkdir -p "$DEST_ROOT/usr/local/lib/ollama"
		for f in "$OLLAMA_LIB"/*.so* "$OLLAMA_LIB"/llama-server "$OLLAMA_LIB"/llama-quantize; do
			[ -e "$f" ] && cp -a "$f" "$DEST_ROOT/usr/local/lib/ollama/"
		done
		[ -d "$OLLAMA_LIB/vulkan" ] && cp -a "$OLLAMA_LIB/vulkan" "$DEST_ROOT/usr/local/lib/ollama/"
		echo "staged -> usr/local/lib/ollama ($(du -sh "$DEST_ROOT/usr/local/lib/ollama" | cut -f1))"
	else
		echo "stage-extras: no Ollama at $OLLAMA_BIN — Zee Zee will have no local brain" >&2
	fi

	if [ -d "$MODELS_SRC/manifests" ]; then
		echo "staging Ollama models (this is the big one)"
		MODELS_DEST="$DEST_ROOT/usr/share/ollama/.ollama/models"
		rm -rf "$MODELS_DEST"
		mkdir -p "$(dirname "$MODELS_DEST")"
		cp -a "$MODELS_SRC" "$MODELS_DEST"
		echo "staged -> usr/share/ollama/.ollama/models ($(du -sh "$MODELS_DEST" | cut -f1))"
	else
		echo "stage-extras: no model store at $MODELS_SRC." >&2
		echo "              Build one without needing root over /usr/share/ollama:" >&2
		echo "                mkdir -p $MODELS_SRC" >&2
		echo "                OLLAMA_MODELS=$MODELS_SRC OLLAMA_HOST=127.0.0.1:11435 ollama serve &" >&2
		echo "                OLLAMA_HOST=127.0.0.1:11435 ollama pull llama3.2:latest" >&2
		echo "                OLLAMA_HOST=127.0.0.1:11435 ollama pull nomic-embed-text:latest" >&2
		echo "                cd <ai-twin repo> && OLLAMA_HOST=127.0.0.1:11435 ollama create ai-twin-custom -f Modelfile.ai-twin" >&2
	fi
fi

echo
echo "total staged: $(du -sh "$DEST_ROOT" | cut -f1)"
echo "Now build:  sudo bash $OS_DIR/build-in-container.sh"
