import { neon } from '@neondatabase/serverless';

let schemaReady = false;
let businessSchemaReady = false;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
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

function requireSqlClient() {
  const sql = getSqlClient();
  if (!sql) {
    throw new Error('Missing DATABASE_URL environment variable');
  }
  return sql;
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

export async function ensureBusinessSchema() {
  if (businessSchemaReady) {
    return;
  }

  const sql = requireSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS rifas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      total_quotas INTEGER,
      status TEXT,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pedidos (
      id BIGSERIAL PRIMARY KEY,
      external_reference TEXT UNIQUE NOT NULL,
      raffle_id TEXT REFERENCES rifas(id),
      selected_numbers_csv TEXT,
      amount NUMERIC(12,2) NOT NULL,
      buyer_name TEXT,
      buyer_email TEXT,
      buyer_cpf TEXT,
      payment_method_id TEXT,
      payment_id TEXT,
      status TEXT NOT NULL,
      status_detail TEXT,
      mp_status TEXT,
      mp_status_detail TEXT,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pedidos_raffle_id
    ON pedidos (raffle_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pedidos_payment_id
    ON pedidos (payment_id)
  `;

  businessSchemaReady = true;
}

export async function upsertRifa(raffle) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  await sql`
    INSERT INTO rifas (
      id,
      title,
      price,
      total_quotas,
      status,
      raw_payload,
      updated_at
    ) VALUES (
      ${raffle.id},
      ${raffle.title || 'Rifa sem titulo'},
      ${Number(raffle.price || 0)},
      ${Number.isFinite(Number(raffle.totalQuotas)) ? Number(raffle.totalQuotas) : null},
      ${raffle.status || null},
      ${raffle.rawPayload || {}},
      NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      total_quotas = EXCLUDED.total_quotas,
      status = EXCLUDED.status,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
  `;
}

export async function createPedido(pedido) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const rows = await sql`
    INSERT INTO pedidos (
      external_reference,
      raffle_id,
      selected_numbers_csv,
      amount,
      buyer_name,
      buyer_email,
      buyer_cpf,
      payment_method_id,
      status,
      status_detail,
      raw_payload,
      updated_at
    ) VALUES (
      ${pedido.externalReference},
      ${pedido.raffleId || null},
      ${pedido.selectedNumbersCsv || null},
      ${Number(pedido.amount || 0)},
      ${pedido.buyerName || null},
      ${pedido.buyerEmail || null},
      ${pedido.buyerCpf || null},
      ${pedido.paymentMethodId || null},
      ${pedido.status || 'pending'},
      ${pedido.statusDetail || null},
      ${pedido.rawPayload || {}},
      NOW()
    )
    ON CONFLICT (external_reference)
    DO UPDATE SET
      raffle_id = EXCLUDED.raffle_id,
      selected_numbers_csv = EXCLUDED.selected_numbers_csv,
      amount = EXCLUDED.amount,
      buyer_name = EXCLUDED.buyer_name,
      buyer_email = EXCLUDED.buyer_email,
      buyer_cpf = EXCLUDED.buyer_cpf,
      payment_method_id = EXCLUDED.payment_method_id,
      status = EXCLUDED.status,
      status_detail = EXCLUDED.status_detail,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
    RETURNING id
  `;

  return rows?.[0]?.id || null;
}

export async function updatePedidoByExternalReference(externalReference, updates) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  await sql`
    UPDATE pedidos
    SET
      payment_id = COALESCE(${updates.paymentId || null}, payment_id),
      payment_method_id = COALESCE(${updates.paymentMethodId || null}, payment_method_id),
      status = COALESCE(${updates.status || null}, status),
      status_detail = COALESCE(${updates.statusDetail || null}, status_detail),
      mp_status = COALESCE(${updates.mpStatus || null}, mp_status),
      mp_status_detail = COALESCE(${updates.mpStatusDetail || null}, mp_status_detail),
      raw_payload = COALESCE(${updates.rawPayload || null}, raw_payload),
      updated_at = NOW()
    WHERE external_reference = ${externalReference}
  `;
}
