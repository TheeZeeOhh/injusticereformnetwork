with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "r") as f:
    text = f.read()

text = text.replace(
    """export async function start(): Promise<string> {
  if (started) return "already running";
  unlisteners.push(await listen<string>("zee://message", (e) => handleLine(e.payload)));""",
    """export async function start(): Promise<string> {
  if (started) return "already running";
  started = true;
  unlisteners.push(await listen<string>("zee://message", (e) => handleLine(e.payload)));"""
)

text = text.replace("  started = true;\n  return await invoke<string>(\"bridge_start\");", "  return await invoke<string>(\"bridge_start\");")

with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "w") as f:
    f.write(text)
