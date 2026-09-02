import re
with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "r") as f:
    text = f.read()

# Replace the previous injection
old_injection = """    if brain and hasattr(brain, "recall"):
        try:
            recall = brain.recall(prompt)"""

new_injection = """    if brain and hasattr(brain, "recall"):
        try:
            # Inject ALL facts (up to 50) on every turn instead of keyword matching the prompt,
            # so she always fundamentally knows who the user is.
            recall = brain.recall("", k=50)"""

text = text.replace(old_injection, new_injection)

with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "w") as f:
    f.write(text)
