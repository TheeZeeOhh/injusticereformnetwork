with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bars.tsx", "r") as f:
    text = f.read()

funcs = """
  async function minimizeApp() {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      note(`minimize failed: ${e}`);
    }
  }

  async function closeApp() {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      note(`close failed: ${e}`);
    }
  }

  async function open(url: string, what: string) {"""

text = text.replace("  async function open(url: string, what: string) {", funcs)

buttons = """
      <button className="iconbtn" onClick={togglePin} title="Toggle Always on Top">
        {pinned ? "📌" : "📍"}
      </button>
      <button className="iconbtn" onClick={minimizeApp} title="Minimize">_</button>
      <button className="iconbtn" onClick={closeApp} title="Close">✕</button>
    </header>"""

text = text.replace("""      <button className="iconbtn" onClick={togglePin} title="Toggle Always on Top">
        {pinned ? "📌" : "📍"}
      </button>
    </header>""", buttons)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bars.tsx", "w") as f:
    f.write(text)
