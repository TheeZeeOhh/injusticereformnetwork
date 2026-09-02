with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "r") as f:
    text = f.read()

aether_logic = """
import aether_autonomous

def _aether_mood(mood, glyph):
    emit("aether_mood", {"mood": mood, "glyph": glyph})

def _aether_suggestion(title, text):
    emit("aether_suggestion", {"title": title, "text": text})

_aether_crew = aether_autonomous.AetherCrewmate(
    check_interval=15,
    on_mood=_aether_mood,
    on_suggestion=_aether_suggestion
)
_aether_crew.start()
"""

if "import sys\n" in text:
    text = text.replace("import sys\n", "import sys\n" + aether_logic)

with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "w") as f:
    f.write(text)
