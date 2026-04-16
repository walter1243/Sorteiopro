import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL nao encontrada. Defina DATABASE_URL no .env.local antes de executar.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function run() {
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

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pedidos_external_reference
    ON pedidos (external_reference)
  `;

  console.log('Schema Neon criado com sucesso: tabelas rifas e pedidos.');
}

run().catch((error) => {
  console.error('Erro ao criar schema Neon:', error.message || error);
  process.exit(1);
});
