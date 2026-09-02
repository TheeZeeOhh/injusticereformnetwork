with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "r") as f:
    text = f.read()

text = text.replace(
    "let stderrHandlers: ((msg: string) => void)[] = [];",
    "let stderrHandlers: ((msg: string) => void)[] = [];\nlet aetherMoodHandlers: ((mood: string, glyph: string) => void)[] = [];\nlet aetherSuggestionHandlers: ((title: string, text: string) => void)[] = [];"
)

text = text.replace(
    "export function onStderr(h: (msg: string) => void) {",
    """export function onAetherMood(h: (mood: string, glyph: string) => void) {
  aetherMoodHandlers.push(h);
}
export function onAetherSuggestion(h: (title: string, text: string) => void) {
  aetherSuggestionHandlers.push(h);
}
export function onStderr(h: (msg: string) => void) {"""
)

handle_line = """
  if (msg.type === "aether_mood") {
    aetherMoodHandlers.forEach(h => h(msg.mood, msg.glyph));
    return;
  }
  if (msg.type === "aether_suggestion") {
    aetherSuggestionHandlers.forEach(h => h(msg.title, msg.text));
    return;
  }
"""

text = text.replace("  const entry = pending.get(msg.id);", handle_line + "\n  const entry = pending.get(msg.id);")

with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "w") as f:
    f.write(text)
