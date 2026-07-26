const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Get Intelligence Status
router.get('/status', async (req, res) => {
  try {
    const emberFund = await prisma.emberFund.findFirst();
    const balance = emberFund ? emberFund.balance : 0;
    
    const recentAudits = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5
    });

    // NOTE: BAM scores are 42 CFR Part 2 SUD data and are NOT stored server-side.
    // They live per-client in the client's encrypted Vault B only.
    res.json({
      emberFundBalance: balance,
      recentAudits
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Trigger Policy Sentinel
router.post('/scan', async (req, res) => {
  // Simulate finding a threat
  const alerts = [
    "[Policy Sentinel] Alert: 2026 Civil Monetary Penalty adjustments detected. HIPAA compliance review required."
  ];
  res.json({ success: true, alerts });
});

// Add Test Data: Revenue Log
router.post('/revenue', async (req, res) => {
  const { amount } = req.body;
  const log = await prisma.revenueLog.create({
    data: { revenue: parseFloat(amount) }
  });
  res.json(log);
});

// Add Test Data: Audit Log
router.post('/audit', async (req, res) => {
  const { category, details } = req.body;
  const log = await prisma.auditLog.create({
    data: { category, details }
  });
  res.json(log);
});

module.exports = router;
