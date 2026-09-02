with open("/home/aziza/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Add global keydown listener for Escape
effect = """
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        bridge.stopGen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
"""

text = text.replace("  useEffect(() => {", effect + "\n  useEffect(() => {", 1)

with open("/home/aziza/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
