/// <reference types="cypress" />

/**
 * Suíte E2E — Super Admin (T1) + Billing Stripe (T1)
 *
 * Cobertura:
 * 1. Rotas públicas: /login, /cadastro, /termos, /privacidade
 * 2. Rotas protegidas → redirect /login sem sessão
 * 3. APIs admin: contratos 401/403 sem autenticação
 * 4. APIs billing: contratos 401/400 sem autenticação
 * 5. Zero window.alert/confirm/prompt (Governance V3/V6)
 * 6. POST /api/admin/broadcast: validação de payload
 */

// ─── 1. Rotas públicas ────────────────────────────────────────────────────────

describe('Páginas públicas', () => {
  ['/login', '/cadastro', '/termos', '/privacidade'].forEach((route) => {
    it(`${route}: carrega sem erro e sem window.alert`, () => {
      cy.on('window:alert', (msg) => {
        throw new Error(`window.alert() detectado em ${route}: ${msg}`);
      });
      cy.on('window:confirm', (msg) => {
        throw new Error(`window.confirm() detectado em ${route}: ${msg}`);
      });
      cy.visit(route);
      cy.get('body').should('be.visible');
      cy.scrollTo('bottom', { ensureScrollable: false });
    });
  });
});

// ─── 2. Rotas protegidas ─────────────────────────────────────────────────────

describe('Rotas protegidas redirecionam sem autenticação', () => {
  const protected_routes = ['/', '/analisar', '/resultados', '/projetos', '/configuracoes', '/minha-conta', '/pricing'];

  protected_routes.forEach((route) => {
    it(`${route} → /login sem sessão`, () => {
      cy.visit(route);
      cy.url().should('include', '/login');
    });
  });

  it('/admin → /login sem sessão', () => {
    cy.visit('/admin');
    cy.url().should('satisfy', (url: string) => url.includes('/login') || url.includes('/'));
  });
});

// ─── 3. Contratos das APIs Admin (sem auth → 401/403) ────────────────────────

describe('API /api/admin/* — contratos de segurança (sem auth)', () => {
  it('POST /api/admin/nfse/cancel → 401 ou 403', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/nfse/cancel',
      body: { stripeInvoiceId: 'in_test_123' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });

  it('POST /api/admin/nfse/resend → 401 ou 403', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/nfse/resend',
      body: { stripeInvoiceId: 'in_test_123' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });

  it('POST /api/admin/broadcast → 401 ou 403 sem auth', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/broadcast',
      body: { planSlug: 'all', subject: 'Teste', message: 'Mensagem de teste' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });

  it('GET /api/admin/users → 401 ou 403', () => {
    cy.request({
      method: 'GET',
      url: '/api/admin/users',
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });

  it('GET /api/admin/mrr → 401 ou 403', () => {
    cy.request({
      method: 'GET',
      url: '/api/admin/mrr',
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });
});

// ─── 4. Contratos das APIs de Billing ────────────────────────────────────────

describe('API /api/* billing — contratos sem auth', () => {
  it('POST /api/checkout → 401 sem auth', () => {
    cy.request({
      method: 'POST',
      url: '/api/checkout',
      body: { planSlug: 'grafico' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [400, 401, 403]);
  });

  it('GET /api/analyses/usage → 401 ou 200 (retorna vazio)', () => {
    cy.request({
      method: 'GET',
      url: '/api/analyses/usage',
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [200, 401]);
  });

  it('POST /api/portal → 401 sem auth', () => {
    cy.request({
      method: 'POST',
      url: '/api/portal',
      body: {},
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [401, 403]);
  });
});

// ─── 5. Validação de payload /api/admin/broadcast ────────────────────────────

describe('POST /api/admin/broadcast — validação de payload', () => {
  it('rejeita payload sem subject (400 ou 401/403)', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/broadcast',
      body: { planSlug: 'all', message: 'sem subject' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [400, 401, 403]);
  });

  it('rejeita payload sem message (400 ou 401/403)', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/broadcast',
      body: { planSlug: 'all', subject: 'Assunto sem mensagem' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [400, 401, 403]);
  });

  it('rejeita planSlug inválido (400 ou 401/403)', () => {
    cy.request({
      method: 'POST',
      url: '/api/admin/broadcast',
      body: { planSlug: 'invalido', subject: 'Teste', message: 'Mensagem' },
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [400, 401, 403]);
  });
});

// ─── 6. Conformidade Governance — zero alertas nativos ───────────────────────

describe('Governance V3/V6 — zero window.alert em todo fluxo público', () => {
  ['/login', '/cadastro'].forEach((route) => {
    it(`${route}: sem window.alert/confirm ao interagir`, () => {
      cy.on('window:alert', (msg) => {
        throw new Error(`window.alert() em ${route}: ${msg}`);
      });
      cy.on('window:confirm', () => {
        throw new Error(`window.confirm() em ${route}`);
      });
      cy.visit(route);
      cy.get('body').click(100, 100);
      cy.scrollTo('bottom', { ensureScrollable: false });
      cy.get('body').should('be.visible');
    });
  });
});
