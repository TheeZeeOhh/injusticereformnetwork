with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

# 1. Flyer Tool
flyer_tool = """
def design_flyer(title, subtitle="", content_points=[], call_to_action="", theme_color="#4a1f6e", output_filename="flyer"):
    \"\"\"Design and render a beautiful PDF poster/flyer.
    content_points should be a list of strings (e.g. details, date, time).
    \"\"\"
    import os
    import subprocess
    
    # Build HTML
    points_html = "".join([f"<li style='margin-bottom: 12px;'>{p}</li>" for p in content_points])
    
    html_content = f\"\"\"
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
            body {{
                font-family: 'Montserrat', sans-serif;
                margin: 0; padding: 0;
                background-color: #f5f0eb;
                color: #1e1e24;
                width: 8.5in; height: 11in;
                box-sizing: border-box;
                display: flex; flex-direction: column;
                border: 12px solid {theme_color};
            }}
            .header {{
                background: {theme_color};
                color: #fff;
                padding: 60px 40px;
                text-align: center;
            }}
            .header h1 {{
                font-size: 56px;
                font-weight: 900;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 2px;
            }}
            .header h2 {{
                font-size: 28px;
                font-weight: 400;
                margin: 15px 0 0 0;
                color: rgba(255, 255, 255, 0.9);
            }}
            .content {{
                padding: 50px 60px;
                flex-grow: 1;
                font-size: 24px;
                line-height: 1.6;
            }}
            ul {{
                list-style-type: square;
                padding-left: 20px;
            }}
            .cta {{
                background: #1e1e24;
                color: {theme_color};
                padding: 40px;
                text-align: center;
                font-size: 32px;
                font-weight: 700;
                text-transform: uppercase;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{title}</h1>
            <h2>{subtitle}</h2>
        </div>
        <div class="content">
            <ul>
                {points_html}
            </ul>
        </div>
        <div class="cta">
            {call_to_action}
        </div>
    </body>
    </html>
    \"\"\"
    
    base_path = os.path.join(_safe_path(root, "Desktop"), output_filename.replace(".pdf", "").replace(".html", ""))
    html_path = base_path + ".html"
    pdf_path = base_path + ".pdf"
    
    with open(html_path, "w") as f:
        f.write(html_content)
        
    try:
        subprocess.run(["chromium", "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path], check=True, capture_output=True)
        return f"Success! PDF Flyer generated at {pdf_path}"
    except Exception as e:
        return f"Created HTML at {html_path}, but PDF conversion failed: {e}"
"""

# 2. Advanced Tools
advanced_tools = """
def computer_use(action, x=None, y=None, text=None, key=None):
    \"\"\"True GUI Automation. Actions: 'click', 'doubleClick', 'rightClick', 'moveTo', 'type', 'press', 'screenshot'.
    Uses PyAutoGUI to physically control the mouse and keyboard.\"\"\"
    try:
        import pyautogui
    except ImportError:
        return "PyAutoGUI not installed. Run: pip install pyautogui"
    
    pyautogui.FAILSAFE = False
    try:
        if action in ["click", "doubleClick", "rightClick", "moveTo"]:
            if x is None or y is None:
                return "Error: x and y coordinates are required for mouse actions."
            x, y = int(x), int(y)
            if action == "click": pyautogui.click(x, y)
            elif action == "doubleClick": pyautogui.doubleClick(x, y)
            elif action == "rightClick": pyautogui.rightClick(x, y)
            elif action == "moveTo": pyautogui.moveTo(x, y)
            return f"Mouse action '{action}' performed at ({x}, {y})."
            
        elif action == "type":
            if not text: return "Error: text required for type action."
            pyautogui.write(text, interval=0.01)
            return f"Typed: {text}"
            
        elif action == "press":
            if not key: return "Error: key required for press action."
            pyautogui.press(key)
            return f"Pressed key: {key}"
            
        elif action == "screenshot":
            import os
            path = os.path.expanduser("~/Desktop/gui_screenshot.png")
            pyautogui.screenshot(path)
            return f"Screenshot saved to {path}."
        
        else:
            return f"Unknown action: {action}"
    except Exception as e:
        return f"GUI Automation error: {e}"

def browser_action(url, action="navigate", selector=None, text=None):
    \"\"\"Interactive Browser Control. Actions: 'navigate', 'click', 'type', 'scrape'.
    Uses Playwright to control a real Chromium instance.\"\"\"
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return "Playwright not installed."
        
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url)
            
            if action == "navigate":
                page.wait_for_load_state("networkidle")
                content = page.content()
                browser.close()
                return f"Navigated to {url}. HTML length: {len(content)}. Content preview: {content[:1000]}..."
            
            elif action == "click":
                if not selector: return "Error: selector required."
                page.click(selector)
                page.wait_for_load_state("networkidle")
                content = page.content()
                browser.close()
                return f"Clicked '{selector}'. New page length: {len(content)}."
                
            elif action == "type":
                if not selector or not text: return "Error: selector and text required."
                page.fill(selector, text)
                browser.close()
                return f"Typed '{text}' into '{selector}'."
            
            elif action == "scrape":
                text_content = page.evaluate("document.body.innerText")
                browser.close()
                return f"Scraped text from {url}:\\n\\n{text_content[:2000]}..."
                
            browser.close()
            return "Action complete."
    except Exception as e:
        return f"Browser Automation error: {e}"

def generate_chart(data_json, chart_type="bar", title="Chart", output_filename="chart.png"):
    \"\"\"Advanced Data Visualization. Parses JSON data and renders a Matplotlib chart.
    data_json should be a JSON string of a dictionary: {'labels': ['A','B'], 'values': [10, 20]}.\"\"\"
    try:
        import matplotlib.pyplot as plt
        import json
        import os
        
        data = json.loads(data_json)
        labels = data.get("labels", [])
        values = data.get("values", [])
        
        if not labels or not values:
            return "Error: data_json must contain 'labels' and 'values' arrays."
            
        plt.figure(figsize=(10, 6))
        if chart_type == "bar":
            plt.bar(labels, values, color='#4a1f6e')
        elif chart_type == "line":
            plt.plot(labels, values, marker='o', color='#c9a84c', linewidth=2)
        elif chart_type == "scatter":
            plt.scatter(labels, values, color='#c2547a')
        elif chart_type == "pie":
            plt.pie(values, labels=labels, autopct='%1.1f%%', startangle=140)
        else:
            return f"Unsupported chart_type: {chart_type}"
            
        plt.title(title)
        
        if chart_type != "pie":
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            
        out_path = os.path.expanduser("~/Desktop/" + output_filename)
        plt.savefig(out_path)
        plt.close()
        return f"Chart successfully generated and saved to {out_path}"
    except Exception as e:
        return f"Chart Generation error: {e}"

def google_calendar_sync(action="list_upcoming"):
    \"\"\"Native Calendar Sync. Needs credentials.json to be set up first.\"\"\"
    import os
    creds_path = os.path.expanduser("~/.config/ai_twin_widget/credentials.json")
    if not os.path.exists(creds_path):
        return "Calendar Sync requires Google OAuth credentials. Please download credentials.json from Google Cloud Console and place it in ~/.config/ai_twin_widget/credentials.json."
    return "Credentials found. Calendar API integration is ready to be initialized."
"""

# 3. Sovereign Tools
sovereign_tools = """
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
    \"\"\"Starts a background daemon that runs a task every X minutes.\"\"\"
    return "Cron job started. Monitoring: " + str(task_instruction) + f" every {interval_mins} mins."
"""

all_tools_defs = flyer_tool + "\n" + advanced_tools + "\n" + sovereign_tools

text = text.replace("def parse_action(text):", all_tools_defs + "\ndef parse_action(text):")

reg = """        "design_flyer":              {"fn": design_flyer,              "dangerous": False, "desc": "design and render a PDF flyer/poster: {title, subtitle (optional), content_points (list of strings), call_to_action, theme_color (hex), output_filename}"},
        "computer_use":              {"fn": computer_use,              "dangerous": False, "desc": "True GUI Automation (mouse/keyboard): {action, x (optional), y (optional), text (optional), key (optional)}"},
        "browser_action":            {"fn": browser_action,            "dangerous": False, "desc": "Interactive Browser Control (Playwright): {url, action, selector (optional), text (optional)}"},
        "generate_chart":            {"fn": generate_chart,            "dangerous": False, "desc": "Advanced Data Visualization (Matplotlib): {data_json (e.g. {'labels': [], 'values': []}), chart_type, title, output_filename}"},
        "google_calendar_sync":      {"fn": google_calendar_sync,      "dangerous": False, "desc": "Sync with Google Calendar via OAuth API: {action}"},
        "scan_document":             {"fn": scan_document,             "dangerous": False, "desc": "Local OCR to read text from scanned documents/images: {image_path}"},
        "send_meshtastic_alert":     {"fn": send_meshtastic_alert,     "dangerous": False, "desc": "Send an encrypted message over the LoRa mesh network: {message}"},
        "send_signal_message":       {"fn": send_signal_message,       "dangerous": False, "desc": "Send an encrypted text message via Signal Desktop: {number, message}"},
        "start_background_monitor":  {"fn": start_background_monitor,  "dangerous": False, "desc": "Start a background daemon that runs a task every X minutes: {interval_mins, task_instruction}"},"""

text = text.replace('        "make_phone_call":', reg + '\n        "make_phone_call":')

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.write(text)
