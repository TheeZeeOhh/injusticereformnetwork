const fs = require("fs");
const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

text = text.replace("onCouncil={() => setInput(\"council \")}", "onCouncil={() => setInput(\"council \")}\n          onPortal={setActivePortal}");

const addPortalBtns = `
        <button className="zee-btn" onClick={() => setActivePortal("bail_calculator")}>⚖️ Bail Calc</button>
        <button className="zee-btn" onClick={() => setActivePortal("grant_proposal")}>📝 Grant Writer</button>
        <button className="zee-btn" onClick={() => setActivePortal("agent_council")}>💬 Council</button>
        <button className="zee-btn" onClick={() => setActivePortal("invoice")}>🧾 Invoice</button>
`;
text = text.replace(addPortalBtns, "");

fs.writeFileSync(path, text);
