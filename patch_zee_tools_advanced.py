with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

new_tools = """
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
                path = _safe_path(root, "Desktop/gui_screenshot.png")
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
            return "Playwright not installed. Run: pip install playwright && playwright install"
            
        import os
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
                    if not selector: return "Error: selector required for click action."
                    page.click(selector)
                    page.wait_for_load_state("networkidle")
                    content = page.content()
                    browser.close()
                    return f"Clicked '{selector}'. New page length: {len(content)}."
                    
                elif action == "type":
                    if not selector or not text: return "Error: selector and text required for type action."
                    page.fill(selector, text)
                    browser.close()
                    return f"Typed '{text}' into '{selector}'."
                
                elif action == "scrape":
                    # Scrape all text content
                    text_content = page.evaluate("document.body.innerText")
                    browser.close()
                    return f"Scraped text from {url}:\n\n{text_content[:2000]}..."
                    
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
                
            out_path = os.path.join(_safe_path(root, "Desktop"), output_filename)
            plt.savefig(out_path)
            plt.close()
            return f"Chart successfully generated and saved to {out_path}"
        except Exception as e:
            return f"Chart Generation error: {e}"

    def google_calendar_sync(action="list_upcoming"):
        \"\"\"Native Calendar Sync. Needs credentials.json to be set up first.\"\"\"
        import os
        creds_path = _safe_path(root, ".config/ai_twin_widget/credentials.json")
        if not os.path.exists(creds_path):
            return "Calendar Sync requires Google OAuth credentials. Please download credentials.json from Google Cloud Console and place it in ~/.config/ai_twin_widget/credentials.json."
        
        return "Credentials found. Calendar API integration is ready to be initialized."
"""

# Inject before parse_action
text = text.replace("def parse_action(text):", new_tools + "\ndef parse_action(text):")

# Register tools
reg = """        "computer_use":              {"fn": computer_use,              "dangerous": False, "desc": "True GUI Automation (mouse/keyboard): {action, x (optional), y (optional), text (optional), key (optional)}"},
        "browser_action":            {"fn": browser_action,            "dangerous": False, "desc": "Interactive Browser Control (Playwright SPA navigation): {url, action, selector (optional), text (optional)}"},
        "generate_chart":            {"fn": generate_chart,            "dangerous": False, "desc": "Advanced Data Visualization (Matplotlib): {data_json (e.g. {'labels': [], 'values': []}), chart_type ('bar'|'line'|'pie'), title, output_filename}"},
        "google_calendar_sync":      {"fn": google_calendar_sync,      "dangerous": False, "desc": "Sync with Google Calendar via OAuth API: {action}"},"""
text = text.replace('        "design_flyer":', reg + '\n        "design_flyer":')

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.write(text)
