import fs from "fs";

const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

const portalImports = `
import portalsData from "./portals.json";
`;

const portalModal = `
function PortalModal({ id, onClose, onSubmit }: { id: string, onClose: () => void, onSubmit: (id: string, vals: any) => void }) {
  const def = (portalsData as any)[id];
  const [vals, setVals] = useState<any>({});

  useEffect(() => {
    if (!def) return;
    const init: any = {};
    for (const f of def.fields) init[f.name] = f.default;
    setVals(init);
  }, [def]);

  if (!def) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{def.title}</h3>
        {def.fields.map((f: any) => (
          <div key={f.name} style={{ marginBottom: "10px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>{f.label}</label>
            <input 
              type="text" 
              value={vals[f.name] || ""} 
              onChange={e => setVals({...vals, [f.name]: e.target.value})}
              style={{ width: "100%", padding: "8px", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid #444", borderRadius: "4px" }}
            />
          </div>
        ))}
        <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
          <button className="zee-btn" onClick={() => onSubmit(id, vals)}>Submit</button>
          <button className="zee-btn cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
`;

text = text.replace("import './App.css';", "import './App.css';" + portalImports);
text = text.replace("export default function App() {", portalModal + "\nexport default function App() {");

const portalState = `  const [activePortal, setActivePortal] = useState<string | null>(null);`;
text = text.replace("  const [showEq, setShowEq] = useState(false);", "  const [showEq, setShowEq] = useState(false);\n" + portalState);

const handlePortalSubmit = `
  const submitPortal = async (id: string, vals: any) => {
    setActivePortal(null);
    let prompt = "";
    if (id === "agent_council") prompt = "council " + vals.topic;
    else if (id === "grant_proposal") prompt = "grant proposal for " + vals.funder + ", title: " + vals.title + ", amt: " + vals.amt;
    else if (id === "bail_calculator") prompt = "bail calc " + vals.income + " " + vals.dep + " " + vals.exp + " " + vals.bail;
    else if (id === "court_shift") prompt = "court shift " + vals.jurisdiction + " " + vals.courtroom;
    else if (id === "invoice") prompt = "invoice " + vals.client + " for " + vals.amount + " desc: " + vals.desc;
    else if (id === "rapid_response") prompt = "rapid response " + vals.scope;
    else if (id === "obsidian_search") prompt = "notes " + vals.query;
    
    setInput(prompt);
    // Let the standard send() handle it!
    setTimeout(() => document.getElementById("send-btn")?.click(), 50);
  };
`;

text = text.replace("  const endSession = () => {", handlePortalSubmit + "\n  const endSession = () => {");

const portalRender = `      {activePortal && <PortalModal id={activePortal} onClose={() => setActivePortal(null)} onSubmit={submitPortal} />}`;
text = text.replace("      {showEq && <EqModal onClose={() => setShowEq(false)} />}", "      {showEq && <EqModal onClose={() => setShowEq(false)} />}\n" + portalRender);

const addPortalBtns = `
        <button className="zee-btn" onClick={() => setActivePortal("bail_calculator")}>⚖️ Bail Calc</button>
        <button className="zee-btn" onClick={() => setActivePortal("grant_proposal")}>📝 Grant Writer</button>
        <button className="zee-btn" onClick={() => setActivePortal("agent_council")}>💬 Council</button>
        <button className="zee-btn" onClick={() => setActivePortal("invoice")}>🧾 Invoice</button>
`;
text = text.replace("        <button className=\"zee-btn\" onClick={newSession}>＋ New Chat</button>", addPortalBtns + "        <button className=\"zee-btn\" onClick={newSession}>＋ New Chat</button>");

fs.writeFileSync(path, text);
