import { subscriptionHasAccess } from '@/lib/subscription-access';
import type { Subscription } from '@/lib/subscription';

function subscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub', userId: 'user', status: 'active', planSlug: 'panorama', planName: 'Panorama',
    planId: 'plan', priceCents: 14900, maxMonthlyAnalyses: 250,
    stripeCustomerId: null, stripeSubscriptionId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
    cancelAt: null, canceledAt: null, pendingDowngradePlan: null, pendingDowngradeDate: null,
    ...overrides,
  };
}

describe('subscription product access', () => {
  const now = new Date('2026-08-30T12:00:00Z');

  it('grants the active plan and an unexpired trial', () => {
    expect(subscriptionHasAccess(subscription({ status: 'active' }), now)).toBe(true);
    expect(subscriptionHasAccess(subscription({ status: 'trialing', currentPeriodEnd: new Date('2026-08-31T12:00:00Z') }), now)).toBe(true);
  });

  it('blocks an active record whose paid period already ended', () => {
    expect(subscriptionHasAccess(subscription({
      status: 'active',
      currentPeriodEnd: new Date('2026-08-29T12:00:00Z'),
    }), now)).toBe(false);
  });

  it.each(['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'])('blocks status %s', (status) => {
    expect(subscriptionHasAccess(subscription({ status }), now)).toBe(false);
  });

  it('blocks expired trials and missing subscriptions', () => {
    expect(subscriptionHasAccess(subscription({ status: 'trialing', currentPeriodEnd: new Date('2026-08-29T12:00:00Z') }), now)).toBe(false);
    expect(subscriptionHasAccess(null, now)).toBe(false);
  });
});
