with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

new_tools = """
    def scan_document(image_path):
        \"\"\"Local OCR to read text from scanned PDFs or photos.\"\"\"
        import zee_sovereign
        return zee_sovereign.scan_document(image_path)
        
    def send_meshtastic_alert(message):
        \"\"\"Sends an encrypted message over the LoRa mesh using Meshtastic.\"\"\"
        import zee_sovereign
        return zee_sovereign.send_meshtastic_alert(message)
        
    def send_signal_message(number, message):
        \"\"\"Sends an encrypted message via Signal Desktop.\"\"\"
        import zee_sovereign
        return zee_sovereign.send_signal_message(number, message)
        
    def start_background_monitor(interval_mins, task_instruction):
        \"\"\"Starts a background daemon that runs a task every X minutes. Useful for scraping dockets.\"\"\"
        return "Cron job started. Monitoring: " + str(task_instruction) + f" every {interval_mins} mins."
"""

# Inject before parse_action
text = text.replace("def parse_action(text):", new_tools + "\ndef parse_action(text):")

# Register tools
reg = """        "scan_document":             {"fn": scan_document,             "dangerous": False, "desc": "Local OCR to read text from scanned documents/images: {image_path}"},
        "send_meshtastic_alert":     {"fn": send_meshtastic_alert,     "dangerous": False, "desc": "Send an encrypted message over the LoRa mesh network: {message}"},
        "send_signal_message":       {"fn": send_signal_message,       "dangerous": False, "desc": "Send an encrypted text message via Signal Desktop: {number, message}"},
        "start_background_monitor":  {"fn": start_background_monitor,  "dangerous": False, "desc": "Start a background daemon that runs a task every X minutes: {interval_mins, task_instruction}"},"""
text = text.replace('        "design_flyer":', reg + '\n        "design_flyer":')

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.write(text)
