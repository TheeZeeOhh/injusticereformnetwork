import re

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src-tauri/resources/aether_autonomous.py", "r") as f:
    text = f.read()

# Replace PyQt5 imports and signals with standard callbacks
text = text.replace("from PyQt5.QtCore import QObject, pyqtSignal", "")
text = text.replace("class AetherCrewmate(QObject):", "class AetherCrewmate:")
text = text.replace("    suggestion_ready = pyqtSignal(str, str) # title, suggestion_text\n", "")
text = text.replace("    mood_changed = pyqtSignal(str, str)     # mood_name, glyph\n", "")
text = text.replace("    task_completed = pyqtSignal(str, str)   # task_name, result_summary\n", "")

init_old = """    def __init__(self, check_interval: int = 15):
        super().__init__()"""
init_new = """    def __init__(self, check_interval: int = 15, on_suggestion=None, on_mood=None, on_task=None):
        self.on_suggestion = on_suggestion
        self.on_mood = on_mood
        self.on_task = on_task"""
text = text.replace(init_old, init_new)

# Replace emit calls
text = text.replace("self.mood_changed.emit", "if self.on_mood: self.on_mood")
text = text.replace("self.suggestion_ready.emit", "if self.on_suggestion: self.on_suggestion")
text = text.replace("self.task_completed.emit", "if self.on_task: self.on_task")

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src-tauri/resources/aether_autonomous.py", "w") as f:
    f.write(text)
