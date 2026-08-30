-- Billing integrity: Stripe idempotency, email delivery and safe NFS-e retries.

DROP INDEX IF EXISTS sub_stripe_sub_id_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS sub_stripe_sub_id_uidx
  ON subscription(stripe_subscription_id);

ALTER TABLE subscription DROP CONSTRAINT IF EXISTS subscription_status_check;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS last_stripe_event_created timestamptz;
ALTER TABLE subscription ADD CONSTRAINT subscription_status_check
  CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused'
  ));

CREATE TABLE IF NOT EXISTS subscription_event (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text
);
ALTER TABLE subscription_event ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processing';
ALTER TABLE subscription_event ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE subscription_event ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE subscription_event ALTER COLUMN processed_at DROP NOT NULL;
ALTER TABLE subscription_event ALTER COLUMN processed_at DROP DEFAULT;

CREATE TABLE IF NOT EXISTS email_delivery (
  delivery_key text PRIMARY KEY,
  recipient text NOT NULL,
  email_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE email_delivery ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE nfse_emission
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE nfse_emission DROP CONSTRAINT IF EXISTS nfse_emission_status_check;
ALTER TABLE nfse_emission ADD CONSTRAINT nfse_emission_status_check
  CHECK (status IN ('pending', 'emitted', 'canceling', 'canceled', 'error'));
