const fs = require("fs");
const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

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
    
    // Toggle operator mode automatically for tools
    if (!operatorOn) setOperatorOn(true);
    setInput(prompt);
    setTimeout(() => document.getElementById("send-btn")?.click(), 50);
  };
`;

text = text.replace("async function send() {", handlePortalSubmit + "\n  async function send() {");

fs.writeFileSync(path, text);
