import { PgBoss, type QueueOptions } from 'pg-boss';

// pg-boss 12 configures retry and retention per queue, not per instance.
export const scheduledQueueOptions = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  // Completed jobs are retained directly; there is no separate archive table.
  deleteAfterSeconds: 60 * 60 * 24 * 7,
} satisfies QueueOptions;

let boss: PgBoss | null = null;

/**
 * Get or create the pg-boss instance
 * Uses singleton pattern to ensure only one instance exists
 */
export async function getPgBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      // Refresh queue state every 30 seconds.
      monitorIntervalSeconds: 30,
    });

    boss.on('error', (error) => {
      console.error('[pg-boss] Error:', error);
    });

    boss.on('wip', (workers) => {
      const active = workers.reduce((count, worker) => count + worker.count, 0);
      if (active > 0) {
        console.log(`[pg-boss] Active jobs (local workers): ${active}`);
      }
    });

    await boss.start();
    console.log('[pg-boss] Started successfully');
  }
  
  return boss;
}

/**
 * Stop the pg-boss instance gracefully
 */
export async function stopPgBoss(): Promise<void> {
  if (boss) {
    console.log('[pg-boss] Stopping...');
    await boss.stop({ graceful: true, timeout: 30000 });
    boss = null;
    console.log('[pg-boss] Stopped successfully');
  }
}

/**
 * Check if pg-boss is running
 */
export function isPgBossRunning(): boolean {
  return boss !== null;
}

