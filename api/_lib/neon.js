import { neon } from '@neondatabase/serverless';

let schemaReady = false;

function getDatabaseUrl() {
  return (
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

export function getSqlClient() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }
  return neon(databaseUrl);
}

export async function ensurePaymentsSchema() {
  if (schemaReady) {
    return;
  }

  const sql = getSqlClient();
  if (!sql) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS payment_events (
      id BIGSERIAL PRIMARY KEY,
      payment_id TEXT,
      external_reference TEXT,
      source TEXT NOT NULL,
      status TEXT,
      status_detail TEXT,
      payment_method_id TEXT,
      amount NUMERIC(12,2),
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
    ON payment_events (payment_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_payment_events_external_reference
    ON payment_events (external_reference)
  `;

  schemaReady = true;
}

export async function insertPaymentEvent(event) {
  const sql = getSqlClient();
  if (!sql) {
    return;
  }

  await ensurePaymentsSchema();

  await sql`
    INSERT INTO payment_events (
      payment_id,
      external_reference,
      source,
      status,
      status_detail,
      payment_method_id,
      amount,
      raw_payload,
      updated_at
    ) VALUES (
      ${event.paymentId || null},
      ${event.externalReference || null},
      ${event.source || 'unknown'},
      ${event.status || null},
      ${event.statusDetail || null},
      ${event.paymentMethodId || null},
      ${event.amount ?? null},
      ${event.rawPayload || {}},
      NOW()
    )
  `;
}
