with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "r") as f:
    text = f.read()

handlers = """let stderrHandlers: StderrHandler[] = [];
let aetherMoodHandlers: ((mood: string, glyph: string) => void)[] = [];
let aetherSuggestionHandlers: ((title: string, text: string) => void)[] = [];

export function onAetherMood(h: (mood: string, glyph: string) => void) {
  aetherMoodHandlers.push(h);
}
export function onAetherSuggestion(h: (title: string, text: string) => void) {
  aetherSuggestionHandlers.push(h);
}
"""

text = text.replace("let stderrHandlers: StderrHandler[] = [];", handlers)

# Also fix the BridgeMessage type
new_msg = """  | { id: string; type: "approval_request"; action_id: string; cmd: string; args: unknown }
  | { type: "aether_mood"; mood: string; glyph: string }
  | { type: "aether_suggestion"; title: string; text: string };"""

text = text.replace("  | { id: string; type: \"approval_request\"; action_id: string; cmd: string; args: unknown };", new_msg)

with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "w") as f:
    f.write(text)
