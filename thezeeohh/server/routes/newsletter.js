const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/newsletter/subscribe
router.post('/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Valid email is required' });

  try {
    db.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(email);
    res.status(201).json({ success: true, message: "You're on the list! Welcome to Radiant Threshold." });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.json({ success: true, message: "You're already subscribed!" });
    }
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

module.exports = router;
