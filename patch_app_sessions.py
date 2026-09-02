import re

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Replace the initial state
text = text.replace(
    """  const [sessions, setSessions] = useState<Session[]>([
    { id: "current", title: "Current Session", current: true },
  ]);""",
    """  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(String(Date.now()));"""
)

# Fetch sessions on mount, put it right before the first useEffect
fetch_effect = """
  const refreshSessions = async (activeId: string) => {
    try {
      const list = await bridge.sessionsList();
      setSessions(list.map(s => ({ ...s, current: s.id === activeId })));
    } catch {}
  };

  useEffect(() => {
    if (status.startsWith("connected")) {
      refreshSessions(currentSessionId);
    }
  }, [status, currentSessionId]);

  // Save session when chat is not busy and there are turns
  useEffect(() => {
    if (!busy && turns.length > 0) {
      const title = turns[0]?.text.slice(0, 30) || "New Chat";
      bridge.sessionSave(currentSessionId, title, turns).then(() => refreshSessions(currentSessionId));
    }
  }, [busy, turns, currentSessionId]);
"""

text = text.replace("  useEffect(() => {", fetch_effect + "\n  useEffect(() => {", 1)

# Replace LeftPanel callbacks
lp_old = """        <LeftPanel
          open={leftOpen}
          sessions={sessions}
          onNewChat={() => {
            setTurns([]);
            setSessions((prev) => [
              { id: String(Date.now()), title: "Current Session", current: true },
              ...prev.map((p) => ({ ...p, current: false, title: p.title })),
            ]);
          }}
          onSelect={(id) =>
            setSessions((prev) => prev.map((p) => ({ ...p, current: p.id === id })))
          }"""

lp_new = """        <LeftPanel
          open={leftOpen}
          sessions={sessions}
          onNewChat={() => {
            setTurns([]);
            const newId = String(Date.now());
            setCurrentSessionId(newId);
          }}
          onSelect={async (id) => {
            setCurrentSessionId(id);
            setTurns([]);
            try {
              const loaded = await bridge.sessionLoad(id);
              setTurns(loaded as Turn[]);
            } catch (e) {
              note(`Failed to load session: ${e}`);
            }
          }}"""

text = text.replace(lp_old, lp_new)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
