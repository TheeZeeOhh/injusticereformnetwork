import json

for lang in ["en", "es"]:
    with open(f"src/i18n/locales/{lang}.json", "r") as f:
        data = json.load(f)
    if "nav" in data:
        data["nav"]["zeeZee"] = "Zee Zee Twin" if lang == "en" else "Zee Zee Gemela"
    with open(f"src/i18n/locales/{lang}.json", "w") as f:
        json.dump(data, f, indent=2)

with open("src/App.jsx", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "import Messages from './pages/Messages';" in line:
        lines.insert(i, "import ZeeZeePanel from './pages/ZeeZeePanel';\n")
        break

for i, line in enumerate(lines):
    if "labelKey: 'nav.intelligenceLayer'" in line:
        lines.insert(i + 1, "      { to: '/zeezee', icon: '🤖', labelKey: 'nav.zeeZee' },\n")
        break

for i, line in enumerate(lines):
    if "<Route path=\"/nexus\"" in line:
        lines.insert(i + 1, "              <Route path=\"/zeezee\" element={<ZeeZeePanel />} />\n")
        break

with open("src/App.jsx", "w") as f:
    f.writelines(lines)
