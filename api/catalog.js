import { listCatalogRaffles, saveCatalogRaffles } from './_lib/neon.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const items = await listCatalogRaffles();
      return res.status(200).json({ items });
    } catch (error) {
      console.error('[catalog][GET] Error:', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      await saveCatalogRaffles(items);
      return res.status(200).json({ ok: true, count: items.length });
    } catch (error) {
      console.error('[catalog][WRITE] Error:', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
