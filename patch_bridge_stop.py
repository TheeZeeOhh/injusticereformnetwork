with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "r") as f:
    text = f.read()

stop_logic = """
def m_stop_gen(req, params):
    try:
        import zee_brain
        zee_brain._stop_event.set()
    except Exception:
        pass
    return True
"""

text = text.replace("def m_chat(req, params):", stop_logic + "\ndef m_chat(req, params):")

# Clear the event when starting chat
text = text.replace("    prompt = params.get(\"prompt\", \"\")\n    if not prompt:", "    prompt = params.get(\"prompt\", \"\")\n    import zee_brain\n    zee_brain._stop_event.clear()\n    if not prompt:")

# Also for m_operate
text = text.replace("def m_operate(req, params):\n    prompt = params.get(\"prompt\", \"\")\n    if not prompt:", "def m_operate(req, params):\n    prompt = params.get(\"prompt\", \"\")\n    import zee_brain\n    zee_brain._stop_event.clear()\n    if not prompt:")

# Add to METHODS
text = text.replace("    \"chat\": m_chat,", "    \"chat\": m_chat,\n    \"stop_gen\": m_stop_gen,")

with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "w") as f:
    f.write(text)
