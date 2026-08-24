import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { getActiveSubscription } from '@/lib/subscription';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const sub = await getActiveSubscription(session.user.id);
  const customerId = sub?.stripeCustomerId;

  if (!customerId) return Response.json({ error: 'Nenhuma assinatura encontrada.' }, { status: 400 });

  const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/minha-conta`,
  });

  // Se não tiver customerId no sub, buscar direto no banco
  return Response.json({ url: portalSession.url });
}
