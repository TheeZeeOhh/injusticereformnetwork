import sys
import shutil

sys.path.insert(0, "/home/aziza/Desktop/code")
import zee_brain
import zee_study

# Backup memory
shutil.copy2("/home/aziza/.config/ai_twin_widget/zee_memory.json", "/home/aziza/.config/ai_twin_widget/zee_memory.json.bak")
print("Backed up memory store.")

brain = zee_brain.Brain(config_dir="/home/aziza/.config/ai_twin_widget", root="/home/aziza")

def on_doc(name, count, err=None):
    if err:
        print(f"[{name}] Failed: {err}")
    else:
        print(f"[{name}] Learned {count} facts.")

print("Starting study...")
learned, skipped, counts = zee_study.study_all(
    brain.mem,
    lambda p: brain.chat(p),
    only_new=True,
    dry_run=False,
    on_doc=on_doc
)

# Remember to save the memory after study_all!
with brain.mem._lock:
    brain.mem._save()

print(f"Study complete. Learned {learned} facts. Skipped {skipped} docs.")
