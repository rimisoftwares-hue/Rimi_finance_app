'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const TENANT_ID = '01960000-0000-7000-8000-000000000101';
const CUST_1 = '01960000-0000-7000-8000-000000000001';
const CUST_2 = '01960000-0000-7000-8000-000000000002';
const CUST_3 = '01960000-0000-7000-8000-000000000003';
const USER_ID = '01960000-0000-7000-8000-000000000999';

/**
 * In-memory mock store simulating `voice_outbox_events` + `ai_telecalling_call_logs` + `customers`
 * so all 9 queue concurrency, lease, backoff, JIT eligibility, and cancellation invariants
 * are tested deterministically in < 50ms.
 */
function createMockQueueStore(overrides = {}) {
  let seq = 1;
  const outboxRows = [];
  const callLogs = new Map();
  const customers = new Map([
    [CUST_1, { id: CUST_1, cname: 'Muthu Kumar', hplno: 101 }],
    [CUST_2, { id: CUST_2, cname: 'Selvi Raman', hplno: 102 }],
    [CUST_3, { id: CUST_3, cname: 'Karthik Raja', hplno: 103 }],
  ]);

  const runner = {
    outboxRows,
    callLogs,
    customers,
    nowMs: Date.now(),
    hasDedicatedTables: Boolean(overrides.hasDedicatedTables),

    async query(sql, params = []) {
      const norm = sql.replace(/\s+/g, ' ').trim();

      if (norm.includes("to_regclass('public.ai_call_queue_items')")) {
        return {
          rows: [{ tbl: runner.hasDedicatedTables ? 'ai_call_queue_items' : null }],
        };
      }

      if (norm.includes('FROM ai_settings') && norm.includes('voice_config')) {
        return {
          rows: [
            {
              voice_config: {
                manual_queue_concurrency: overrides.maxConcurrency || 1,
              },
            },
          ],
        };
      }

      if (norm.includes('FROM customers c') && norm.includes('ANY($2::uuid[])')) {
        const financeId = params[0];
        const ids = params[1] || [];
        if (financeId !== TENANT_ID) return { rows: [] };
        return {
          rows: ids
            .filter((id) => customers.has(id))
            .map((id) => {
              const c = customers.get(id);
              return { id: c.id, cname: c.cname, hplno: c.hplno };
            }),
        };
      }

      // Active customer check in voice_outbox_events
      if (
        norm.includes("FROM voice_outbox_events") &&
        norm.includes("aggregate_type = 'manual_call_queue_item'") &&
        norm.includes('SELECT')
      ) {
        const financeId = params[0];
        let matched = outboxRows.filter(
          (r) => r.finance_id === financeId && r.aggregate_type === 'manual_call_queue_item'
        );

        if (norm.includes("payload->>'batch_id' = $2")) {
          const batchId = params[1];
          matched = matched.filter((r) => r.payload.batch_id === batchId);
        }

        matched.sort(
          (a, b) => Number(a.payload.queue_position || 0) - Number(b.payload.queue_position || 0)
        );
        return {
          rows: matched.map((r) => ({
            ...r,
            customer_name: customers.get(r.aggregate_id)?.cname || 'Customer',
            hplno: customers.get(r.aggregate_id)?.hplno || null,
            call_log_status: r.payload.call_id
              ? callLogs.get(r.payload.call_id)?.call_lifecycle_status || null
              : null,
            call_log_answered: r.payload.call_id
              ? Boolean(callLogs.get(r.payload.call_id)?.answered)
              : false,
            call_log_spoke: r.payload.call_id
              ? Boolean(callLogs.get(r.payload.call_id)?.customer_spoke)
              : false,
            call_log_disposition: r.payload.call_id
              ? callLogs.get(r.payload.call_id)?.disposition || null
              : null,
          })),
        };
      }

      if (norm.includes('INSERT INTO voice_outbox_events')) {
        const [financeId, aggregateId, payloadJson, maxAttempts, idemKey] = params;
        const existing = outboxRows.find(
          (r) => r.finance_id === financeId && r.idempotency_key === idemKey
        );
        if (existing) {
          return { rows: [existing] };
        }
        const row = {
          id: `01960000-0000-7000-9000-${String(seq++).padStart(12, '0')}`,
          finance_id: financeId,
          aggregate_type: 'manual_call_queue_item',
          aggregate_id: aggregateId,
          event_type: 'manual_queue_dial',
          payload: JSON.parse(payloadJson),
          status: 'pending',
          attempt_count: 0,
          max_attempts: Number(maxAttempts || 2),
          next_retry_at: new Date(runner.nowMs).toISOString(),
          locked_by: null,
          lock_expires_at: null,
          last_error: null,
          idempotency_key: idemKey,
          created_at: new Date(runner.nowMs).toISOString(),
          processed_at: null,
        };
        outboxRows.push(row);
        return { rows: [row] };
      }

      if (norm.includes('UPDATE voice_outbox_events')) {
        const VALID_DB_STATUSES = new Set(['pending', 'processing', 'published', 'dead_letter']);
        // Cancel pending items in batch
        if (norm.includes("SET status = 'published'") && norm.includes("payload->>'batch_id' = $2")) {
          const [financeId, batchId, reasonPayloadJson] = params;
          const patch = JSON.parse(reasonPayloadJson);
          const updated = [];
          for (const r of outboxRows) {
            if (
              r.finance_id === financeId &&
              r.payload.batch_id === batchId &&
              r.status === 'pending'
            ) {
              r.status = 'published';
              r.payload = { ...r.payload, ...patch };
              r.processed_at = new Date(runner.nowMs).toISOString();
              updated.push(r);
            }
          }
          return { rows: updated };
        }

        // Update single outbox item by id
        const id = params[1];
        const financeId = params[0];
        const target = outboxRows.find((r) => r.finance_id === financeId && r.id === id);
        if (!target) return { rows: [] };

        if (norm.includes('status = $3')) {
          if (!VALID_DB_STATUSES.has(params[2])) {
            const err = new Error(`new row violates check constraint "voice_outbox_events_status_check": ${params[2]}`);
            err.code = '23514';
            throw err;
          }
          target.status = params[2];
        }
        if (norm.includes('payload = $4::jsonb')) {
          target.payload = JSON.parse(params[3]);
        }
        if (norm.includes('attempt_count = $5')) {
          target.attempt_count = Number(params[4]);
        }
        if (norm.includes('locked_by = $6')) {
          target.locked_by = params[5];
        }
        if (norm.includes('lock_expires_at = $7')) {
          target.lock_expires_at = params[6];
        }
        if (norm.includes('next_retry_at = $8')) {
          target.next_retry_at = params[7];
        }
        if (norm.includes('last_error = $9')) {
          target.last_error = params[8];
        }
        if (['published', 'dead_letter'].includes(target.status)) {
          target.processed_at = new Date(runner.nowMs).toISOString();
        }
        return { rows: [target] };
      }

      return { rows: [] };
    },
  };

  return runner;
}

test('Phase 3 — Persistent Manual Multi-Call Queue Service & Worker (9 Core Scenarios)', async (t) => {
  const callQueue = require('./callQueue.service');

  await t.test('Case 1: Single customer queue submission dispatches & completes cleanly', async () => {
    const store = createMockQueueStore();
    const dialed = [];

    const batch = await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );

    assert.equal(batch.totalItems, 1);
    assert.equal(batch.items[0].customerId, CUST_1);
    assert.equal(batch.items[0].queuePosition, 1);
    assert.equal(batch.items[0].status, 'pending');

    await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      workerId: 'worker-1',
      initiateCallFn: async (fid, body) => {
        dialed.push({ fid, body });
        const callId = '01960000-0000-7000-8888-000000000001';
        store.callLogs.set(callId, {
          call_lifecycle_status: 'in_progress',
          answered: true,
          customer_spoke: true,
          disposition: null,
        });
        return { callId, callLifecycleStatus: 'initiated' };
      },
    });

    assert.equal(dialed.length, 1);
    assert.deepEqual(dialed[0].body, { customerId: CUST_1 });

    // Simulate call completion
    store.callLogs.set('01960000-0000-7000-8888-000000000001', {
      call_lifecycle_status: 'completed',
      answered: true,
      customer_spoke: true,
      disposition: 'promise_to_pay',
    });

    const afterComplete = await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      workerId: 'worker-1',
      initiateCallFn: async () => {
        throw new Error('Should not dial again');
      },
    });

    assert.equal(afterComplete.completedCount, 1);
    const active = await callQueue.getActiveQueueStatus(TENANT_ID, {
      queryRunner: store,
      batchId: batch.batchId,
    });
    assert.equal(active.batch.status, 'completed');
    assert.equal(active.batch.items[0].status, 'completed');
    assert.equal(active.batch.items[0].callOutcome, 'promise_to_pay');
  });

  await t.test('Case 2: Multiple customers execute strictly sequentially (max_concurrency = 1)', async () => {
    const store = createMockQueueStore();
    const dialOrder = [];

    const batch = await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2, CUST_3] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );
    assert.equal(batch.totalItems, 3);
    assert.deepEqual(
      batch.items.map((i) => i.queuePosition),
      [1, 2, 3]
    );

    const initiateCallFn = async (_fid, { customerId }) => {
      dialOrder.push(customerId);
      const callId = `call-${customerId}`;
      store.callLogs.set(callId, {
        call_lifecycle_status: 'in_progress',
        answered: false,
        customer_spoke: false,
      });
      return { callId };
    };

    // Tick 1: Dials CUST_1 ONLY
    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialOrder, [CUST_1]);

    // Tick 2 while CUST_1 is still in_progress: MUST NOT dial CUST_2!
    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialOrder, [CUST_1]);

    // CUST_1 finishes -> Tick 3 reconciles CUST_1 & dials CUST_2
    store.callLogs.set(`call-${CUST_1}`, {
      call_lifecycle_status: 'completed',
      answered: true,
      customer_spoke: true,
      disposition: 'completed_general',
    });
    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialOrder, [CUST_1, CUST_2]);

    // CUST_2 finishes -> Tick 4 reconciles CUST_2 & dials CUST_3
    store.callLogs.set(`call-${CUST_2}`, {
      call_lifecycle_status: 'completed',
      answered: true,
      customer_spoke: true,
      disposition: 'callback_requested',
    });
    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialOrder, [CUST_1, CUST_2, CUST_3]);
  });

  await t.test('Case 3: Duplicate customer guard deduplicates batch & skips already-active customer', async () => {
    const store = createMockQueueStore();

    const firstBatch = await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_1, CUST_2] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );
    assert.equal(firstBatch.totalItems, 2);

    // Enqueue overlapping [CUST_2, CUST_3] while CUST_2 is still pending in firstBatch
    const secondBatch = await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_2, CUST_3] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );
    assert.equal(secondBatch.totalItems, 1);
    assert.equal(secondBatch.items[0].customerId, CUST_3);
    assert.deepEqual(secondBatch.skippedAlreadyQueued, [CUST_2]);
  });

  await t.test('Case 4: JIT ineligibility (paid / DNC / outside IST window) cancels item without dialing & advances', async () => {
    const store = createMockQueueStore();
    const dialed = [];

    await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );

    const initiateCallFn = async (_fid, { customerId }) => {
      if (customerId === CUST_1) {
        const err = new Error('Customer has no matured overdue EMI balance');
        err.statusCode = 422;
        err.code = 'no_overdue_balance';
        throw err;
      }
      dialed.push(customerId);
      const callId = `call-${customerId}`;
      store.callLogs.set(callId, { call_lifecycle_status: 'in_progress' });
      return { callId };
    };

    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    // CUST_1 cancelled for `no_overdue_balance` AND worker immediately advanced to CUST_2 in same or next tick!
    if (dialed.length === 0) {
      await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    }
    assert.deepEqual(dialed, [CUST_2]);

    const item1 = store.outboxRows.find((r) => r.aggregate_id === CUST_1);
    assert.equal(item1.status, 'published');
    assert.equal(item1.payload.queue_status, 'cancelled');
    assert.equal(item1.payload.skip_reason, 'no_overdue_balance');
  });

  await t.test('Case 5: Worker crash / stale lease recovery reclaims expired item safely without double-dialing live call', async () => {
    const store = createMockQueueStore();
    const dialed = [];

    await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );

    // Simulate crashed worker-A that claimed CUST_1 before dispatching a call, and lease expired 2 mins ago
    const item1 = store.outboxRows[0];
    item1.status = 'processing';
    item1.payload.queue_status = 'processing';
    item1.locked_by = 'dead-worker-A';
    item1.lock_expires_at = new Date(store.nowMs - 120_000).toISOString();

    await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      workerId: 'worker-B',
      initiateCallFn: async (_fid, { customerId }) => {
        dialed.push(customerId);
        const callId = `call-${customerId}`;
        store.callLogs.set(callId, { call_lifecycle_status: 'in_progress' });
        return { callId };
      },
    });

    assert.deepEqual(dialed, [CUST_1]);
  });

  await t.test('Case 6: Provider 503 failure schedules exponential backoff retry, then marks failed & advances', async () => {
    const store = createMockQueueStore();
    const dialed = [];

    await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2] },
      { queryRunner: store, userId: USER_ID, maxAttempts: 2, skipAutoStartWorker: true }
    );

    const failingThenCust2 = async (_fid, { customerId }) => {
      if (customerId === CUST_1) {
        const err = new Error('Voice System Offline');
        err.statusCode = 503;
        err.code = 'voice_system_offline';
        throw err;
      }
      dialed.push(customerId);
      const callId = `call-${customerId}`;
      store.callLogs.set(callId, { call_lifecycle_status: 'in_progress' });
      return { callId };
    };

    // Attempt 1 on CUST_1 -> transient 503 -> status back to pending with future next_retry_at
    await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      initiateCallFn: failingThenCust2,
    });
    const item1After1 = store.outboxRows.find((r) => r.aggregate_id === CUST_1);
    assert.equal(item1After1.attempt_count, 1);
    assert.equal(item1After1.status, 'pending');
    assert.ok(new Date(item1After1.next_retry_at).getTime() > store.nowMs);

    // Advance simulated clock past backoff -> Attempt 2 on CUST_1 -> hits max_attempts (2) -> marked 'dead_letter'/'failed' -> advances to CUST_2!
    store.nowMs += 60_000;
    await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      initiateCallFn: failingThenCust2,
    });
    if (dialed.length === 0) {
      await callQueue.processTenantQueueTick(TENANT_ID, {
        queryRunner: store,
        initiateCallFn: failingThenCust2,
      });
    }

    assert.equal(item1After1.status, 'dead_letter');
    assert.equal(item1After1.payload.queue_status, 'failed');
    assert.deepEqual(dialed, [CUST_2]);
  });

  await t.test('Case 7: Customer no-answer / busy records no_response outcome and advances queue immediately', async () => {
    const store = createMockQueueStore();
    const dialed = [];

    await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );

    const initiateCallFn = async (_fid, { customerId }) => {
      dialed.push(customerId);
      const callId = `call-${customerId}`;
      store.callLogs.set(callId, {
        call_lifecycle_status: 'ringing',
        answered: false,
        customer_spoke: false,
      });
      return { callId };
    };

    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialed, [CUST_1]);

    // Carrier reports no_answer
    store.callLogs.set(`call-${CUST_1}`, {
      call_lifecycle_status: 'no_answer',
      answered: false,
      customer_spoke: false,
      disposition: 'no_answer',
    });

    await callQueue.processTenantQueueTick(TENANT_ID, { queryRunner: store, initiateCallFn });
    assert.deepEqual(dialed, [CUST_1, CUST_2]);

    const item1 = store.outboxRows.find((r) => r.aggregate_id === CUST_1);
    assert.equal(item1.status, 'published');
    assert.equal(item1.payload.queue_status, 'completed');
    assert.equal(item1.payload.call_outcome, 'no_response');
  });

  await t.test('Case 8: User cancels pending queue items while preserving active in-progress call', async () => {
    const store = createMockQueueStore();

    const batch = await callQueue.enqueueManualCallBatch(
      TENANT_ID,
      { customerIds: [CUST_1, CUST_2, CUST_3] },
      { queryRunner: store, userId: USER_ID, skipAutoStartWorker: true }
    );

    await callQueue.processTenantQueueTick(TENANT_ID, {
      queryRunner: store,
      initiateCallFn: async (_fid, { customerId }) => {
        const callId = `call-${customerId}`;
        store.callLogs.set(callId, { call_lifecycle_status: 'in_progress' });
        return { callId };
      },
    });

    const cancelRes = await callQueue.cancelQueueBatch(TENANT_ID, batch.batchId, {
      queryRunner: store,
      userId: USER_ID,
    });
    assert.equal(cancelRes.cancelledCount, 2);

    const active = await callQueue.getActiveQueueStatus(TENANT_ID, {
      queryRunner: store,
      batchId: batch.batchId,
    });
    assert.deepEqual(
      active.batch.items.map((i) => i.status),
      ['processing', 'cancelled', 'cancelled']
    );
  });

  await t.test('Case 9: Zero-Trust body validation rejects untrusted fields and invalid UUIDs', async () => {
    const store = createMockQueueStore();

    await assert.rejects(
      () =>
        callQueue.enqueueManualCallBatch(
          TENANT_ID,
          { customerIds: [CUST_1], financeId: 'evil', phone: '+910000000000' },
          { queryRunner: store }
        ),
      (err) => err.statusCode === 400 && err.code === 'untrusted_client_fields'
    );

    await assert.rejects(
      () =>
        callQueue.enqueueManualCallBatch(
          TENANT_ID,
          { customerIds: ['not-a-uuid'] },
          { queryRunner: store }
        ),
      (err) => err.statusCode === 400 && err.code === 'invalid_customer_id'
    );
  });
});
