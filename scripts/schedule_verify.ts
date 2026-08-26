import { verifySnapshot } from "./weather_validator.js";

async function runAt7AM() {
  const now = new Date();
  const target = new Date();
  
  target.setHours(7, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const msUntil7AM = target.getTime() - now.getTime();
  const hoursUntil = (msUntil7AM / (1000 * 60 * 60)).toFixed(2);

  console.log(`⏰ [Auto-Verify] Target execution: ${target.toLocaleTimeString()} (${hoursUntil} hours from now)`);
  console.log(`😴 Waiting in background until 7:00 AM...`);

  setTimeout(async () => {
    console.log(`\n🔔 7:00 AM Reached! Executing Ground Truth Verification Benchmark...`);
    try {
      await verifySnapshot();
      console.log(`✅ Verification complete! Report written to benchmarks/reports/`);
    } catch (err) {
      console.error(`❌ Verification failed:`, err);
    }
  }, msUntil7AM);
}

runAt7AM();
