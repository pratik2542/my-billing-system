import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runWeeklyBackup } from './backup_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Cron Expression: Default is '0 0 * * 0' (Every Sunday at midnight 00:00:00)
const SCHEDULE = process.env.CRON_SCHEDULE || '0 0 * * 0';
const RUN_ON_STARTUP = process.env.RUN_ON_STARTUP === 'true';

console.log('======================================================');
console.log('🤖 Universal Billing System - Weekly Backup Daemon');
console.log('======================================================');
console.log(`[Daemon] Schedule: ${SCHEDULE} (Every Sunday at midnight)`);
console.log(`[Daemon] Destination: ${process.env.BACKUP_EMAIL_TO || 'myuniversalbillingsystem@gmail.com'}`);
console.log(`[Daemon] PID: ${process.pid}`);
console.log(`[Daemon] Waiting for schedule trigger... (Press Ctrl+C to stop)\n`);

if (RUN_ON_STARTUP) {
  console.log('[Daemon] Initial startup run enabled (RUN_ON_STARTUP=true). Executing backup now...');
  runWeeklyBackup().catch(err => console.error('[Daemon] Startup backup error:', err));
}

// Schedule recurring cron job
cron.schedule(SCHEDULE, async () => {
  console.log(`\n[Daemon] Cron trigger activated at ${new Date().toISOString()}`);
  try {
    const res = await runWeeklyBackup();
    console.log('[Daemon] Execution finished with result:', res.success ? 'SUCCESS' : 'FAILED');
  } catch (err) {
    console.error('[Daemon] Scheduled job error:', err);
  }
});
