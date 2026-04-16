import { getSqlClient } from './_lib/neon.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sql = getSqlClient();
    if (!sql) {
      return res.status(500).json({
        ok: false,
        error: 'Missing NEON_DATABASE_URL (or DATABASE_URL/POSTGRES_URL)'
      });
    }

    const rows = await sql`SELECT NOW() AS now, current_database() AS database_name`;
    const row = rows?.[0] || {};

    return res.status(200).json({
      ok: true,
      now: row.now || null,
      database: row.database_name || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal Server Error' });
  }
}
