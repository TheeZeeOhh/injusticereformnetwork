with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_brain.py", "r") as f:
    text = f.read()

text = text.replace("import json", "import json\nimport threading\n\n_stop_event = threading.Event()")

ollama_loop_old = """        parts = []
        for raw in resp:
            raw = raw.strip()
            if not raw:
                continue"""
ollama_loop_new = """        parts = []
        for raw in resp:
            if _stop_event.is_set():
                parts.append("\\n[Stopped by user]")
                break
            raw = raw.strip()
            if not raw:
                continue"""
text = text.replace(ollama_loop_old, ollama_loop_new)

with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_brain.py", "w") as f:
    f.write(text)
