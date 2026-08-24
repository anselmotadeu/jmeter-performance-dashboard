import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getSubscriptionDetail } from '@/lib/subscription';
import { AlertCircle, Calendar, CreditCard, Info } from 'lucide-react';

export default async function MinhaContaPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const detail = await getSubscriptionDetail(session.user.id);

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Minha Conta</h1>
        <p className="text-slate-500">Informações sobre sua assinatura e uso</p>
      </div>

      <div className="space-y-6">
        {/* Informações do Usuário */}
        <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Info className="h-5 w-5 text-indigo-600" />
            Informações do Perfil
          </h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Nome</dt>
              <dd className="font-semibold">{session.user.name || 'Não informado'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="font-semibold">{session.user.email}</dd>
            </div>
          </dl>
        </section>

        {/* Status da Assinatura */}
        <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            Assinatura
          </h2>

          {detail?.subscription ? (
            <div className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Plano Atual</dt>
                <dd className="font-bold text-indigo-600">{detail.subscription.planName}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Status</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      detail.subscription.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                        : detail.subscription.status === 'trialing'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400'
                        : detail.subscription.status === 'past_due'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {detail.subscription.status === 'active' && 'Ativo'}
                    {detail.subscription.status === 'trialing' && 'Trial'}
                    {detail.subscription.status === 'past_due' && 'Pagamento Pendente'}
                    {detail.subscription.status === 'canceled' && 'Cancelado'}
                    {detail.subscription.status === 'unpaid' && 'Não Pago'}
                  </span>
                </dd>
              </div>

              {detail.isTrial && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-950/20 dark:border-blue-900">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    {detail.isExpired ? (
                      <>
                        <AlertCircle className="inline h-4 w-4 mr-1" />
                        Seu período de teste expirou. Assine um plano para continuar usando todos os recursos.
                      </>
                    ) : (
                      <>
                        <Info className="inline h-4 w-4 mr-1" />
                        Você está no período de teste gratuito de 7 dias. Faltam{' '}
                        <strong>{detail.trialDaysLeft}</strong> dia(s).
                      </>
                    )}
                  </p>
                </div>
              )}

              {detail.subscription.currentPeriodEnd && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500 flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {detail.isTrial ? 'Trial expira em' : 'Próxima renovação'}
                  </dt>
                  <dd className="font-semibold">
                    {new Date(detail.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                  </dd>
                </div>
              )}

              {detail.isCanceled && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 dark:bg-red-950/20 dark:border-red-900">
                  <p className="text-sm text-red-900 dark:text-red-100">
                    <AlertCircle className="inline h-4 w-4 mr-1" />
                    Sua assinatura foi cancelada. O acesso continuará disponível até{' '}
                    {detail.accessExpiresAt
                      ? new Date(detail.accessExpiresAt).toLocaleDateString('pt-BR')
                      : 'o fim do período atual'}
                    .
                  </p>
                </div>
              )}

              {detail.isCanceledScheduled && !detail.isCanceled && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 dark:bg-amber-950/20 dark:border-amber-900">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <Info className="inline h-4 w-4 mr-1" />
                    Cancelamento programado para{' '}
                    {detail.accessExpiresAt
                      ? new Date(detail.accessExpiresAt).toLocaleDateString('pt-BR')
                      : 'o fim do período atual'}
                    .
                  </p>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-xs text-slate-500 mb-3">
                  Para alterar seu plano, acessar o portal de pagamento ou cancelar, utilize os links abaixo:
                </p>
                <div className="flex gap-3">
                  <Link
                    href="/pricing"
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    Ver Planos
                  </Link>
                  <Link
                    href="/configuracoes"
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    Configurações
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-4">Você ainda não possui uma assinatura ativa.</p>
              <Link
                href="/pricing"
                className="inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Escolher Plano
              </Link>
            </div>
          )}
        </section>

        {/* Limites de Uso */}
        {detail?.subscription && (
          <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
            <h2 className="text-xl font-bold mb-4">Limites do Plano</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Análises por mês</dt>
                <dd className="font-semibold">{detail.subscription.maxMonthlyAnalyses}</dd>
              </div>
              <p className="text-xs text-slate-500 pt-2 border-t">
                O contador de análises é resetado no início de cada ciclo de cobrança.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
