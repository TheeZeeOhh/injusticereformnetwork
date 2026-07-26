const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class DaemonManager {
  start() {
    console.log("🧠 Starting Sanctuary v7.0 Daemons...");
    
    // Policy Sentinel Agent
    setInterval(() => {
      // Mocking the Federal Register fetch so we don't spam their API
    }, 60000);

    // Predictive Interrupter (BWC Module)
    setInterval(async () => {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const crisisEvents = await prisma.auditLog.findMany({
          where: {
            category: 'crisis',
            timestamp: { gte: oneDayAgo }
          },
          orderBy: { timestamp: 'asc' }
        });

        if (crisisEvents.length >= 3) {
          console.log("🚨 [Predictive Interrupter] HIGH-TENSION ALERT: Crisis cluster detected!");
        }
      } catch (err) {
        console.error("Daemon Error:", err);
      }
    }, 10000);

    // NOTE: The former "Clinical Co-Pilot" BAM-delta daemon was removed. BAM
    // scores are 42 CFR Part 2 SUD data and never reach this operational server;
    // they live per-client in the client's encrypted Vault B. BAM delta/triage
    // detection now runs client-side in IntelligenceLayer, against the client's
    // own decrypted history, and never leaves the device.

    // The Ember Fund Revenue Tracker
    setInterval(async () => {
      try {
        const unprocessedLogs = await prisma.revenueLog.findMany({
          where: { processed: false }
        });

        if (unprocessedLogs.length > 0) {
          let totalRevenue = 0;
          const sovereigntyTax = 0.15;
          
          for (const log of unprocessedLogs) {
            totalRevenue += log.revenue;
            await prisma.revenueLog.update({
              where: { id: log.id },
              data: { processed: true }
            });
          }
          
          const taxAmount = totalRevenue * sovereigntyTax;
          
          const fund = await prisma.emberFund.findFirst();
          if (fund) {
            await prisma.emberFund.update({
              where: { id: fund.id },
              data: { balance: fund.balance + taxAmount }
            });
          } else {
            await prisma.emberFund.create({
              data: { balance: taxAmount }
            });
          }
          
          console.log(`🔥 [Ember Fund Tracker] Swept $${taxAmount.toFixed(2)} in sovereignty tax into the Ember Fund!`);
        }
      } catch (err) {
        console.error("Daemon Error:", err);
      }
    }, 10000);
  }
}

module.exports = new DaemonManager();
