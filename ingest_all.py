import sys
sys.path.insert(0, "/home/aziza/Desktop/code")
import zee_brain

brain = zee_brain.Brain(config_dir="/home/aziza/.config/ai_twin_widget", root="/home/aziza")

print("Ingesting /home/aziza...")
res = brain.tools["ingest_directory"]["fn"]("/home/aziza", recursive=True)
print(res)
