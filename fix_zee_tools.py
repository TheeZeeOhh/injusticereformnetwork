import re
with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

# Fix the broken line
text = re.sub(r'return f"Scraped text from \{url\}:.*?\n\n\{text_content\[:2000\]\}\.\.\."', r'return f"Scraped text from {url}:\\n\\n{text_content[:2000]}..."', text, flags=re.DOTALL)

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.write(text)
