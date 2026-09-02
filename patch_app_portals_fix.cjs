const fs = require("fs");

const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

text = text.replace('import "./App.css";', 'import "./App.css";\nimport portalsData from "./portals.json";');

fs.writeFileSync(path, text);
