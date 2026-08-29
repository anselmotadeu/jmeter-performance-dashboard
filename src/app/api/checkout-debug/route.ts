import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS } from '@/lib/plans';

/**
 * GET /api/checkout-debug — diagnóstico completo do fluxo de checkout.
 * Protegido por token. TEMPORÁRIO — remover após diagnóstico.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== 'anstech-debug-2026') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result: Record<string, unknown> = {};

  // 1. Variáveis de ambiente
  result.env = {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '(empty)',
    STRIPE_PRICE_GRAFICO_ID: process.env.STRIPE_PRICE_GRAFICO_ID || '(empty)',
    STRIPE_PRICE_PANORAMA_ID: process.env.STRIPE_PRICE_PANORAMA_ID || '(empty)',
    STRIPE_SECRET_KEY_prefix: (process.env.STRIPE_SECRET_KEY || '').slice(0, 12) + '...',
    DATABASE_URL_prefix: (process.env.DATABASE_URL || '').slice(0, 30) + '...',
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Planos carregados
  result.plans = {
    grafico: { slug: PLANS.grafico?.slug, price: PLANS.grafico?.priceCents, priceId: PLANS.grafico?.stripePriceId },
    panorama: { slug: PLANS.panorama?.slug, price: PLANS.panorama?.priceCents, priceId: PLANS.panorama?.stripePriceId },
  };

  // 3. Testar conexão Stripe
  const APP_URL = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      custom_fields: [{
        key: 'cpf_cnpj',
        label: { type: 'custom', custom: 'CPF ou CNPJ' },
        type: 'text',
        optional: false,
      }],
      line_items: [{ price: PLANS.grafico?.stripePriceId!, quantity: 1 }],
      metadata: { userId: 'debug-test', planSlug: 'grafico' },
      success_url: `${APP_URL}/minha-conta?checkout=success`,
      cancel_url: `${APP_URL}/pricing`,
      locale: 'pt-BR',
    });
    result.stripe_test = { success: true, session_id: session.id, url_preview: session.url?.slice(0, 60) };
  } catch (err) {
    result.stripe_test = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      error_type: (err as { type?: string })?.type,
      error_code: (err as { code?: string })?.code,
      error_param: (err as { param?: string })?.param,
    };
  }

  // 4. Testar auth (sem sessão real neste contexto)
  result.auth_url = `${process.env.BETTER_AUTH_URL}/api/auth`;

  return Response.json(result, { status: 200 });
}
