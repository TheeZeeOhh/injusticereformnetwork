const fs = require("fs");
const path = "/home/aziza/Desktop/code/ai_twin_app/src/panels.tsx";
let text = fs.readFileSync(path, "utf-8");

text = text.replace("  onCouncil: () => void;", "  onCouncil: () => void;\n  onPortal: (id: string) => void;");
text = text.replace("  onCouncil,", "  onCouncil,\n  onPortal,");

const portalsSection = `
      <div className="sec">CIVIC PORTALS</div>
      <Row label="⚖️  Bail Calculator" onClick={() => onPortal("bail_calculator")} />
      <Row label="📝  Grant Proposal Writer" onClick={() => onPortal("grant_proposal")} />
      <Row label="🧾  Mutual Aid Invoice" onClick={() => onPortal("invoice")} />
      <Row label="💬  Agent Council Debate" onClick={() => onPortal("agent_council")} />
      <Row label="🚨  Rapid Response Alert" onClick={() => onPortal("rapid_response")} />
      <Row label="📋  Court Watch Shift Rota" onClick={() => onPortal("court_shift")} />
      <Row label="🧠  Obsidian Notes Search" onClick={() => onPortal("obsidian_search")} />
`;

text = text.replace("      <div className=\"sec\">INTELLIGENCE</div>", portalsSection + "\n      <div className=\"sec\">INTELLIGENCE</div>");

fs.writeFileSync(path, text);
