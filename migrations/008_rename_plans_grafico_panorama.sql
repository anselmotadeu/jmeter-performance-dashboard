-- Migration 008: Renomear planos Monitor/Radar → Gráfico/Panorama
-- Governance V6 §6.2: slugs e preços oficiais do JMeter Performance Dashboard.
--
-- Plano Gráfico:  R$ 49/mês (4900 centavos) | 50 análises/mês
-- Plano Panorama: R$ 149/mês (14900 centavos) | 250 análises/mês
--
-- ATENÇÃO: Esta migration atualiza dados existentes no banco.
-- Os usuários com subscription 'monitor' passam a ter 'grafico'.
-- Os usuários com subscription 'radar' passam a ter 'panorama'.
-- Não há perda de acesso — os limites se mantêm idênticos.

-- 1. Atualizar slugs e nomes na tabela plan (upsert seguro via ON CONFLICT)
INSERT INTO plan (slug, name, description, price_cents, max_monthly_analyses)
VALUES
  ('grafico',  'Gráfico',  'Visualização essencial de performance — 50 análises/mês',      4900,  50),
  ('panorama', 'Panorama', 'Visão completa de performance — 250 análises/mês + exportação', 14900, 250)
ON CONFLICT (slug) DO UPDATE
  SET name               = excluded.name,
      description        = excluded.description,
      price_cents        = excluded.price_cents,
      max_monthly_analyses = excluded.max_monthly_analyses;

-- 2. Migrar subscriptions ativas de 'monitor' → 'grafico'
UPDATE subscription
SET plan_id = (SELECT id FROM plan WHERE slug = 'grafico' LIMIT 1)
WHERE plan_id IN (SELECT id FROM plan WHERE slug = 'monitor');

-- 3. Migrar subscriptions ativas de 'radar' → 'panorama'
UPDATE subscription
SET plan_id = (SELECT id FROM plan WHERE slug = 'panorama' LIMIT 1)
WHERE plan_id IN (SELECT id FROM plan WHERE slug = 'radar');

-- 4. Migrar registros de uso (analysis_usage.plan_slug)
UPDATE analysis_usage SET plan_slug = 'grafico'  WHERE plan_slug = 'monitor';
UPDATE analysis_usage SET plan_slug = 'panorama' WHERE plan_slug = 'radar';

-- 5. Migrar pending_downgrade_plan nas subscriptions
UPDATE subscription SET pending_downgrade_plan = 'grafico'  WHERE pending_downgrade_plan = 'monitor';
UPDATE subscription SET pending_downgrade_plan = 'panorama' WHERE pending_downgrade_plan = 'radar';

-- 6. Remover planos antigos (somente se não houver mais referências)
--    Usamos DELETE seguro: se ainda houver FK, o banco lança erro e a migration aborta.
DELETE FROM plan WHERE slug IN ('monitor', 'radar');

-- Comentário de auditoria
COMMENT ON TABLE plan IS 'Planos do JMeter Performance Dashboard. Slugs oficiais: grafico (R$49) e panorama (R$149). Migration 008 — 2026-08-28.';
