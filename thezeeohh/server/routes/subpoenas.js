const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all threat heatmap data and logs
router.get('/', (req, res) => {
  try {
    // Fetch FOIA requests
    const foiaStmt = db.prepare('SELECT * FROM foia_requests ORDER BY request_date DESC');
    const foiaRequests = foiaStmt.all();

    // Fetch Docket alerts
    const docketStmt = db.prepare('SELECT * FROM docket_alerts ORDER BY date_filed DESC');
    const docketAlerts = docketStmt.all();

    // Compute aggregated heatmap threat levels by state
    // We group by state and check: Red if docket_alerts exist, Yellow if foia_requests exist, else Green
    const stateStats = {};

    foiaRequests.forEach(req => {
      const state = req.state;
      if (!stateStats[state]) {
        stateStats[state] = { state, foia_requests_count: 0, federal_dockets_count: 0, threat_level: 'Green' };
      }
      stateStats[state].foia_requests_count += 1;
      if (stateStats[state].threat_level !== 'Red') {
        stateStats[state].threat_level = 'Yellow';
      }
    });

    docketAlerts.forEach(alert => {
      const state = alert.state_jurisdiction;
      if (!stateStats[state]) {
        stateStats[state] = { state, foia_requests_count: 0, federal_dockets_count: 0, threat_level: 'Green' };
      }
      stateStats[state].federal_dockets_count += 1;
      stateStats[state].threat_level = 'Red';
    });

    const heatmap = Object.values(stateStats);

    res.json({
      heatmap,
      foiaRequests,
      docketAlerts
    });
  } catch (error) {
    console.error('Failed to query subpoena tracker:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Post a new docket alert (used by the scraper)
router.post('/dockets', (req, res) => {
  const { docket_id, case_name, docket_number, court, state_jurisdiction, date_filed, url } = req.body;
  if (!docket_id || !state_jurisdiction) {
    return res.status(400).json({ error: 'docket_id and state_jurisdiction are required' });
  }

  try {
    const insert = db.prepare(`
      INSERT INTO docket_alerts (docket_id, case_name, docket_number, court, state_jurisdiction, date_filed, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(docket_id) DO UPDATE SET
        case_name = excluded.case_name,
        docket_number = excluded.docket_number,
        court = excluded.court,
        state_jurisdiction = excluded.state_jurisdiction,
        date_filed = excluded.date_filed,
        url = excluded.url
    `);
    
    insert.run(docket_id, case_name, docket_number, court, state_jurisdiction, date_filed, url);
    res.json({ success: true, message: 'Docket alert logged' });
  } catch (error) {
    console.error('Failed to log docket alert:', error);
    res.status(500).json({ error: 'Database insert failed' });
  }
});

// Post a new FOIA request update
router.post('/foia', (req, res) => {
  const { state, request_date, status, notes } = req.body;
  if (!state) {
    return res.status(400).json({ error: 'state is required' });
  }

  try {
    const insert = db.prepare(`
      INSERT INTO foia_requests (state, request_date, status, notes)
      VALUES (?, ?, ?, ?)
    `);
    
    insert.run(state, request_date || new Date().toISOString().split('T')[0], status || 'Pending', notes || '');
    res.json({ success: true, message: 'FOIA request logged' });
  } catch (error) {
    console.error('Failed to log FOIA request:', error);
    res.status(500).json({ error: 'Database insert failed' });
  }
});

module.exports = router;
