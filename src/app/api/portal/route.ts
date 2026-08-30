import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { getStripeCustomerId } from '@/lib/subscription';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const customerId = await getStripeCustomerId(session.user.id);

  if (!customerId) return Response.json({ error: 'Nenhuma assinatura encontrada.' }, { status: 400 });

  const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/minha-conta`,
    });
    return Response.json({ url: portalSession.url });
  } catch (error) {
    console.error('[portal]', error);
    return Response.json({ error: 'Não foi possível abrir o portal do Stripe.' }, { status: 500 });
  }
}
