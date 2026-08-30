/** @jest-environment node */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('billing integrity migration', () => {
  const sql = readFileSync(join(process.cwd(), 'migrations/011_billing_flow_integrity.sql'), 'utf8');

  it('creates durable Stripe event and email idempotency ledgers', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS subscription_event');
    expect(sql).toContain("status text NOT NULL DEFAULT 'processing'");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS email_delivery');
    expect(sql).toContain('processing_started_at');
  });

  it('supports Stripe statuses and serialized NFS-e cancellation', () => {
    expect(sql).toContain("'incomplete_expired'");
    expect(sql).toContain("'paused'");
    expect(sql).toContain("'canceling'");
  });
});
