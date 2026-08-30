-- Migration 010: Atualizar stripe_price_id nos planos e corrigir índice da subscription
-- Necessário para que o webhook siga o padrão TestDiff (lookup por stripe_price_id)

-- 1. Gravar os Price IDs reais do Stripe nos planos
UPDATE plan SET stripe_price_id = 'price_1U9bcyLb7KOFrwJPMk62fa9H' WHERE slug = 'grafico';
UPDATE plan SET stripe_price_id = 'price_1U9bczLb7KOFrwJPsZJz2hNb' WHERE slug = 'panorama';

-- 2. Adicionar índice único por stripe_subscription_id (para ON CONFLICT no webhook)
-- O TestDiff usa ON CONFLICT (stripe_subscription_id) em vez do índice parcial
CREATE UNIQUE INDEX IF NOT EXISTS sub_stripe_sub_id_uidx ON subscription(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- 3. Limpar o registro "confirm_email_sub_..." que não é NFS-e (é marcador de e-mail)
-- Na tabela nfse_emission, esse registro com stripe_invoice_id começando por "confirm_email_"
-- é um artefato do mecanismo anti-duplicata de e-mail — não deve aparecer como NFS-e emitida.
-- Mantemos apenas como marcador interno (não exibimos na UI quando não tem nfse_numero).
-- A query de listagem já vai filtrar via WHERE nfse_numero IS NOT NULL OR status != 'emitted'.
