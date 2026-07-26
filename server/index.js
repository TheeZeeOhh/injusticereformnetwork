// Sanctuary operational backend.
//
// This process intentionally holds NO client PHI. All patient/client data lives
// only in the client-side, passphrase-derived, AES-256-GCM encrypted local vault
// (IndexedDB). This server exists solely to run the operational "intelligence"
// daemons (Ember Fund sweeps, audit-cluster detection) over non-PHI operational
// telemetry. Clinical data such as BAM scores is 42 CFR Part 2 and stays entirely
// client-side in the encrypted vault — never here.
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Local-only: the operational backend must never be exposed to the network.
const HOST = '127.0.0.1';

app.use(express.json());

const intelligenceRoutes = require('./routes/intelligence');
app.use('/api/intelligence', intelligenceRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sanctuary operational backend (no PHI).' });
});

const daemonManager = require('./daemons');
daemonManager.start();

app.listen(PORT, HOST, () => {
  console.log(`Operational backend listening on http://${HOST}:${PORT} (no PHI stored).`);
});
