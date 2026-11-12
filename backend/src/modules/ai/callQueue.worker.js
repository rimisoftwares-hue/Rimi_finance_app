'use strict';

/**
 * Queue worker entrypoint re-exporting `callQueue.service.js` lifecycle helpers
 * for startup recovery or standalone execution.
 */
const { db } = require('../../config/database.config');
const callQueueService = require('./callQueue.service');

/**
 * Recover any tenant queues that still have `pending` or `processing` items
 * after a backend process restart.
 */
async function recoverActiveTenantQueuesOnBoot() {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT finance_id
         FROM voice_outbox_events
        WHERE aggregate_type = 'manual_call_queue_item'
          AND status IN ('pending', 'processing')`
    );
    for (const row of rows) {
      if (row.finance_id) {
        callQueueService.startQueueWorkerIfNeeded(String(row.finance_id));
      }
    }
    return rows.length;
  } catch (err) {
    console.warn('[CallQueue] Boot recovery skipped:', err.message);
    return 0;
  }
}

module.exports = {
  ...callQueueService,
  recoverActiveTenantQueuesOnBoot,
};

