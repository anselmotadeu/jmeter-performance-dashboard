export type AccessSubscription = {
  status: string;
  currentPeriodEnd: Date | null;
};

export function subscriptionHasAccess(subscription: AccessSubscription | null, now = new Date()): boolean {
  if (!subscription) return false;
  if (subscription.status === 'trialing') {
    return !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > now;
  }
  return subscription.status === 'active' &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);
}
