/** @jest-environment node */

jest.mock('@/lib/auth', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  },
}));
jest.mock('@/lib/subscription', () => ({
  getActiveSubscription: jest.fn(),
  getRecoverableStripeSubscription: jest.fn(),
  getStripeCustomerId: jest.fn(),
}));
jest.mock('@/lib/plans', () => ({
  PLANS: {
    grafico: { slug: 'grafico', stripePriceId: 'price_grafico' },
    panorama: { slug: 'panorama', stripePriceId: 'price_panorama' },
  },
}));

import { POST } from '@/app/api/checkout/route';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import {
  getActiveSubscription,
  getRecoverableStripeSubscription,
  getStripeCustomerId,
} from '@/lib/subscription';

const session = { user: { id: 'user-1', email: 'user@example.com' } };

function request(planSlug = 'panorama') {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planSlug }),
  });
}

describe('POST /api/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth.api.getSession as jest.Mock).mockResolvedValue(session);
    (getActiveSubscription as jest.Mock).mockResolvedValue(null);
    (getRecoverableStripeSubscription as jest.Mock).mockResolvedValue(null);
    (getStripeCustomerId as jest.Mock).mockResolvedValue(null);
  });

  it('requires authentication', async () => {
    (auth.api.getSession as jest.Mock).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
  });

  it('creates checkout with address, fiscal document and subscription metadata', async () => {
    (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        billing_address_collection: 'required',
        metadata: { userId: 'user-1', planSlug: 'panorama' },
        subscription_data: { metadata: { userId: 'user-1', planSlug: 'panorama' } },
        custom_fields: [expect.objectContaining({ key: 'cpf_cnpj', optional: false })],
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('subscription_checkout:user-1:panorama:') }),
    );
  });

  it('does not create a second checkout for an active subscription', async () => {
    (getActiveSubscription as jest.Mock).mockResolvedValue({ status: 'active' });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('sends a recoverable Stripe subscription to the customer portal', async () => {
    (getRecoverableStripeSubscription as jest.Mock).mockResolvedValue({ stripeCustomerId: 'cus_123' });
    (stripe.billingPortal.sessions.create as jest.Mock).mockResolvedValue({ url: 'https://billing.stripe.test/portal' });
    const response = await POST(request('grafico'));
    expect(await response.json()).toEqual({ url: 'https://billing.stripe.test/portal', portal: true });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
