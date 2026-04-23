import { neon } from '@neondatabase/serverless';

let schemaReady = false;
let businessSchemaReady = false;

function getDatabaseUrl() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
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
      cover_image_url TEXT,
      status TEXT,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE rifas
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT
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
      buyer_phone TEXT,
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
    CREATE TABLE IF NOT EXISTS rifa_images (
      id BIGSERIAL PRIMARY KEY,
      raffle_id TEXT NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      storage_key TEXT,
      caption TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      is_cover BOOLEAN NOT NULL DEFAULT FALSE,
      mime_type TEXT,
      size_bytes BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS buyer_phone TEXT
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
    CREATE INDEX IF NOT EXISTS idx_pedidos_buyer_cpf
    ON pedidos (buyer_cpf)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pedidos_buyer_phone
    ON pedidos (buyer_phone)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_rifa_images_raffle_id
    ON rifa_images (raffle_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_rifa_images_cover
    ON rifa_images (raffle_id, is_cover)
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
      cover_image_url,
      status,
      raw_payload,
      updated_at
    ) VALUES (
      ${raffle.id},
      ${raffle.title || 'Rifa sem titulo'},
      ${Number(raffle.price || 0)},
      ${Number.isFinite(Number(raffle.totalQuotas)) ? Number(raffle.totalQuotas) : null},
      ${raffle.coverImageUrl || null},
      ${raffle.status || null},
      ${raffle.rawPayload || {}},
      NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      total_quotas = EXCLUDED.total_quotas,
      cover_image_url = COALESCE(EXCLUDED.cover_image_url, rifas.cover_image_url),
      status = EXCLUDED.status,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
  `;
}

export async function addRifaImage(image) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const rows = await sql`
    INSERT INTO rifa_images (
      raffle_id,
      image_url,
      storage_key,
      caption,
      position,
      is_cover,
      mime_type,
      size_bytes,
      updated_at
    ) VALUES (
      ${image.raffleId},
      ${image.imageUrl},
      ${image.storageKey || null},
      ${image.caption || null},
      ${Number.isFinite(Number(image.position)) ? Number(image.position) : 0},
      ${Boolean(image.isCover)},
      ${image.mimeType || null},
      ${Number.isFinite(Number(image.sizeBytes)) ? Number(image.sizeBytes) : null},
      NOW()
    )
    RETURNING id
  `;

  if (image.isCover) {
    await sql`
      UPDATE rifa_images
      SET is_cover = FALSE, updated_at = NOW()
      WHERE raffle_id = ${image.raffleId}
      AND id <> ${rows?.[0]?.id || 0}
    `;

    await sql`
      UPDATE rifas
      SET cover_image_url = ${image.imageUrl}, updated_at = NOW()
      WHERE id = ${image.raffleId}
    `;
  }

  return rows?.[0]?.id || null;
}

export async function listRifaImages(raffleId) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const rows = await sql`
    SELECT id, raffle_id, image_url, storage_key, caption, position, is_cover, mime_type, size_bytes, created_at, updated_at
    FROM rifa_images
    WHERE raffle_id = ${raffleId}
    ORDER BY is_cover DESC, position ASC, id ASC
  `;

  return rows || [];
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
      buyer_phone,
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
      ${pedido.buyerPhone || null},
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
      buyer_phone = EXCLUDED.buyer_phone,
      payment_method_id = EXCLUDED.payment_method_id,
      status = EXCLUDED.status,
      status_detail = EXCLUDED.status_detail,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
    RETURNING id
  `;

  return rows?.[0]?.id || null;
}

export async function listTicketsByDocument(documentDigits) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const digits = String(documentDigits || '').replace(/\D/g, '');
  if (!digits) {
    return [];
  }

  const withCountryCode = digits.startsWith('55') ? digits : `55${digits}`;

  const rows = await sql`
    SELECT
      p.external_reference,
      p.raffle_id,
      p.selected_numbers_csv,
      p.status,
      p.mp_status,
      p.created_at,
      r.title AS raffle_title
    FROM pedidos p
    LEFT JOIN rifas r ON r.id = p.raffle_id
    WHERE
      p.buyer_cpf = ${digits}
      OR p.buyer_phone = ${digits}
      OR p.buyer_phone = ${withCountryCode}
      OR regexp_replace(COALESCE(p.raw_payload->'request'->'metadata'->>'buyerPhone', ''), '[^0-9]', '', 'g') = ${digits}
      OR regexp_replace(COALESCE(p.raw_payload->'request'->'metadata'->>'buyerPhone', ''), '[^0-9]', '', 'g') = ${withCountryCode}
      OR regexp_replace(COALESCE(p.raw_payload->'request'->'payer'->'phone'->>'number', ''), '[^0-9]', '', 'g') = ${digits}
      OR regexp_replace(COALESCE(p.raw_payload->'request'->'payer'->'phone'->>'number', ''), '[^0-9]', '', 'g') = ${withCountryCode}
      OR regexp_replace(COALESCE(p.raw_payload->'response'->'payer'->'phone'->>'number', ''), '[^0-9]', '', 'g') = ${digits}
      OR regexp_replace(COALESCE(p.raw_payload->'response'->'payer'->'phone'->>'number', ''), '[^0-9]', '', 'g') = ${withCountryCode}
    ORDER BY p.created_at DESC
    LIMIT 200
  `;

  return rows || [];
}

export async function listApprovedTicketsByRaffle(raffleId) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const id = String(raffleId || '').trim();
  if (!id) {
    return [];
  }

  const rows = await sql`
    SELECT
      p.external_reference,
      p.raffle_id,
      p.selected_numbers_csv,
      p.buyer_name,
      p.buyer_email,
      p.buyer_cpf,
      p.buyer_phone,
      p.payment_method_id,
      p.payment_id,
      p.status,
      p.mp_status,
      p.created_at,
      r.title AS raffle_title
    FROM pedidos p
    LEFT JOIN rifas r ON r.id = p.raffle_id
    WHERE p.raffle_id = ${id}
      AND COALESCE(NULLIF(LOWER(p.mp_status), ''), LOWER(p.status), '') = 'approved'
    ORDER BY p.created_at DESC
    LIMIT 5000
  `;

  return rows || [];
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

export async function listCatalogRaffles() {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const rows = await sql`
    SELECT id, title, price, total_quotas, cover_image_url, status, raw_payload
    FROM rifas
    ORDER BY created_at ASC
  `;

  return (rows || [])
    .filter((row) => {
      const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {};
      if (raw.__catalog === true) {
        return true;
      }

      // Backward compatibility with older admin saves.
      if ('totalQuotas' in raw || 'imageUrl' in raw || 'prizeNumbers' in raw || 'prizeWhatsapp' in raw) {
        return true;
      }

      // Fallback for rows with explicit quota/image columns.
      if (Number(row.total_quotas || 0) > 0 || Boolean(row.cover_image_url)) {
        return true;
      }

      // Ignore rows created only by payment metadata.
      return false;
    })
    .map((row) => {
    const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {};
    const prizeNumbers = Array.isArray(raw.prizeNumbers) ? raw.prizeNumbers : [];
    const quickDrawWinners = Array.isArray(raw.quickDrawWinners)
      ? raw.quickDrawWinners
          .map((item) => {
            const number = String(item?.number ?? '').replace(/\D/g, '').slice(-3).padStart(3, '0');
            if (!number) {
              return null;
            }
            return {
              ...item,
              number
            };
          })
          .filter(Boolean)
      : [];
    return {
      id: raw.id || row.id,
      title: raw.title || raw.prizeName || row.title || 'Rifa',
      prizeName: raw.prizeName || raw.title || row.title || 'Rifa',
      price: Number(raw.price ?? row.price ?? 0),
      totalQuotas: Number(raw.totalQuotas ?? row.total_quotas ?? 0),
      imageUrl: raw.imageUrl || row.cover_image_url || '',
      status: raw.status || row.status || 'paused',
      winner: raw.winner || null,
      drawMethod: raw.drawMethod || 'random_internal',
      prizeNumbers,
      prizeWhatsapp: raw.prizeWhatsapp || '',
      quickDrawWinners
    };
  });
}

export async function saveCatalogRaffles(items) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const list = Array.isArray(items) ? items : [];

  for (const item of list) {
    const raffle = item && typeof item === 'object' ? item : {};
    const raffleId = String(raffle.id || '').trim();
    if (!raffleId) {
      continue;
    }

    const rawPayload = {
      ...raffle,
      __catalog: true
    };

    await sql`
      INSERT INTO rifas (
        id,
        title,
        price,
        total_quotas,
        cover_image_url,
        status,
        raw_payload,
        updated_at
      ) VALUES (
        ${raffleId},
        ${raffle.title || raffle.prizeName || 'Rifa'},
        ${Number(raffle.price || 0)},
        ${Number(raffle.totalQuotas || 0)},
        ${raffle.imageUrl || null},
        ${raffle.status || 'paused'},
        ${rawPayload},
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        total_quotas = EXCLUDED.total_quotas,
        cover_image_url = EXCLUDED.cover_image_url,
        status = EXCLUDED.status,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `;
  }
}

export async function deleteCatalogRaffle(raffleId) {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const id = String(raffleId || '').trim();
  if (!id) {
    return;
  }

  await sql`
    DELETE FROM rifas
    WHERE id = ${id}
  `;
}

export async function ensureRifaExists(raffleId, title = 'Rifa') {
  const sql = requireSqlClient();
  await ensureBusinessSchema();

  const id = String(raffleId || '').trim();
  if (!id) {
    return;
  }

  await sql`
    INSERT INTO rifas (id, title, price, total_quotas, status, raw_payload, updated_at)
    VALUES (${id}, ${title || 'Rifa'}, 0, NULL, 'active', '{}'::jsonb, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}
