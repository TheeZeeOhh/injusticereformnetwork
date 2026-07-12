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

    // Clinical Co-Pilot
    setInterval(async () => {
      try {
        const history = await prisma.bamHistory.findMany({
          orderBy: { timestamp: 'desc' },
          take: 2
        });

        if (history.length === 2) {
          const lastScore = history[0].score;
          const previousScore = history[1].score;
          if (Math.abs(lastScore - previousScore) > 0.15 * Math.abs(previousScore)) {
            console.log("🧠 [Clinical Co-Pilot] CLINICAL ALERT: Significant BAM score delta detected! Flagged for triage.");
          }
        }
      } catch (err) {
        console.error("Daemon Error:", err);
      }
    }, 10000);

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
