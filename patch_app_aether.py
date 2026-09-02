with open("/home/aziza/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Listen to Aether thoughts
text = text.replace(
    "  const [busy, setBusy] = useState(false);",
    "  const [busy, setBusy] = useState(false);\n  const [petMood, setPetMood] = useState(\"🐆✨\");"
)

effect = """
  useEffect(() => {
    bridge.onAetherMood((mood, glyph) => {
      setPetMood(glyph);
    });
    bridge.onAetherSuggestion((title, text) => {
      setTurns((t) => [...t, { role: "zee", text: `[Aether: ${title}] ${text}` }]);
    });
  }, []);
"""

text = text.replace("  const refreshSessions = async (activeId: string) => {", effect + "\n  const refreshSessions = async (activeId: string) => {")

with open("/home/aziza/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
