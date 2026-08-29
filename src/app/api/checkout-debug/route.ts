import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';
import { db } from '@/lib/db';

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
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    BETTER_AUTH_SECRET_set: !!process.env.BETTER_AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Planos carregados
  result.plans = {
    grafico: { slug: PLANS.grafico?.slug, price: PLANS.grafico?.priceCents, priceId: PLANS.grafico?.stripePriceId },
    panorama: { slug: PLANS.panorama?.slug, price: PLANS.panorama?.priceCents, priceId: PLANS.panorama?.stripePriceId },
  };

  // 3. Sessão do usuário (se houver cookie)
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user) {
      result.auth = { 
        user_id: session.user.id, 
        email: session.user.email,
        role: (session.user as Record<string, unknown>).role,
      };
      
      // 4. Subscription do usuário logado
      try {
        const sub = await getActiveSubscription(session.user.id);
        result.subscription = sub ? {
          status: sub.status,
          planSlug: sub.planSlug,
          planName: sub.planName,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: (sub as Record<string, unknown>).trial_ends_at,
        } : null;
        
        // Se tem sub ativa, checkout seria bloqueado com erro amigável
        if (sub && sub.status === 'active') {
          result.checkout_would_fail = 'ALREADY_ACTIVE: Você já possui uma assinatura ativa.';
        }
      } catch (subErr) {
        result.subscription_error = subErr instanceof Error ? subErr.message : String(subErr);
      }

      // 5. Subscription direta no banco para debug
      try {
        const raw = await db.query(`
          SELECT s.id, s.status, s.trial_ends_at, s.current_period_end,
                 p.slug as plan_slug
          FROM subscription s
          LEFT JOIN plan p ON p.id = s.plan_id
          WHERE s.user_id = $1
          ORDER BY s.created_at DESC LIMIT 3
        `, [session.user.id]);
        result.subscription_raw = raw.rows;
      } catch (dbErr) {
        result.subscription_db_error = dbErr instanceof Error ? dbErr.message : String(dbErr);
      }
    } else {
      result.auth = null;
    }
  } catch (authErr) {
    result.auth_error = authErr instanceof Error ? authErr.message : String(authErr);
  }

  // 6. Testar conexão Stripe (sem sessão real)
  const APP_URL = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PLANS.grafico?.stripePriceId ?? '', quantity: 1 }],
      metadata: { userId: 'debug-test', planSlug: 'grafico' },
      success_url: `${APP_URL}/minha-conta?checkout=success`,
      cancel_url: `${APP_URL}/pricing`,
      locale: 'pt-BR',
    });
    result.stripe_test = { success: true, session_id: session.id };
  } catch (err) {
    result.stripe_test = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      error_type: (err as Record<string, string>)?.type,
      error_code: (err as Record<string, string>)?.code,
      error_param: (err as Record<string, string>)?.param,
    };
  }

  return Response.json(result, { status: 200 });
}
