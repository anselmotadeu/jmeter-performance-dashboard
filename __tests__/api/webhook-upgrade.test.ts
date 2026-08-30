/** @jest-environment node */

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }));
jest.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { update: jest.fn() },
  },
}));
jest.mock('@/lib/subscription', () => ({ clearSubscriptionCache: jest.fn() }));
jest.mock('@/lib/nfse-webhook', () => ({
  emitirNFSeForInvoice: jest.fn(),
  emitirNFSeForUpgradeSession: jest.fn(),
  getInvoiceSubscriptionId: jest.fn(),
}));
jest.mock('@/lib/email', () => ({
  sendCancellationEmail: jest.fn(),
  sendSubscriptionConfirmationEmail: jest.fn(),
  sendPaymentFailedEmail: jest.fn(),
}));

import { POST } from '@/app/api/webhooks/stripe/route';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { emitirNFSeForUpgradeSession } from '@/lib/nfse-webhook';

const session = {
  id: 'cs_test_upgrade',
  mode: 'payment',
  payment_status: 'paid',
  amount_total: 5432,
  customer: 'cus_1',
  metadata: {
    type: 'upgrade',
    userId: 'user-1',
    planSlug: 'panorama',
    subscriptionId: 'sub_1',
    newPriceId: 'price_pan',
    itemId: 'item_1',
  },
};

const updatedSub = {
  id: 'sub_1',
  status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
  items: {
    data: [
      {
        id: 'item_1',
        price: { id: 'price_pan' },
        current_period_start: 1600000000,
        current_period_end: 1900000000,
      },
    ],
  },
};

function request() {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'test_sig' },
    body: JSON.stringify({ type: 'checkout.session.completed' }),
  });
}

describe('POST /api/webhooks/stripe — upgrade checkout (mode=payment)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: 1700000000,
      data: { object: session },
    });
    (stripe.subscriptions.update as jest.Mock).mockResolvedValue(updatedSub);
  });

  function mockDbSequence(upsertRowCount: number) {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // claim subscription_event
      .mockResolvedValueOnce({ rows: [{ id: 'plan_2', name: 'Panorama' }] }) // plan lookup
      .mockResolvedValueOnce({ rowCount: upsertRowCount, rows: [] }); // upsertSubscription
    // demais queries (limpeza pending_downgrade) caem no default
    (db.query as jest.Mock).mockResolvedValue({ rowCount: 0, rows: [] });
  }

  it('emite NFS-e mesmo quando o upsert é ignorado por evento fora de ordem', async () => {
    mockDbSequence(0); // upsert rowCount 0 → antigo código pulava a emissão
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ items: [{ id: 'item_1', price: 'price_pan' }] }),
    );
    expect(emitirNFSeForUpgradeSession).toHaveBeenCalledTimes(1);
    expect(emitirNFSeForUpgradeSession).toHaveBeenCalledWith(session);
  });

  it('emite NFS-e quando o upsert é aplicado normalmente', async () => {
    mockDbSequence(1);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(emitirNFSeForUpgradeSession).toHaveBeenCalledWith(session);
  });
});