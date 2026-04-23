import { listApprovedTicketsByRaffle } from './_lib/neon.js';

function normalizeNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(-3).padStart(3, '0');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const raffleId = String(req.query.raffleId || '').trim();
    if (!raffleId) {
      return res.status(400).json({ error: 'raffleId query param is required' });
    }

    const rows = await listApprovedTicketsByRaffle(raffleId);
    const tickets = {};

    for (const row of rows) {
      const rawNumbers = String(row.selected_numbers_csv || '')
        .split(',')
        .map((item) => normalizeNumber(item))
        .filter(Boolean);

      for (const number of rawNumbers) {
        if (tickets[number]) {
          continue;
        }

        tickets[number] = {
          number,
          buyerName: row.buyer_name || '',
          buyerEmail: row.buyer_email || '',
          buyerCpf: row.buyer_cpf || '',
          buyerWhatsapp: row.buyer_phone || '',
          status: row.mp_status || row.status || 'approved',
          raffleId: row.raffle_id || raffleId,
          raffleTitle: row.raffle_title || 'Rifa',
          paymentMethod: row.payment_method_id || '-',
          paymentId: row.payment_id || '-',
          date: row.created_at || null,
          externalReference: row.external_reference || null
        };
      }
    }

    return res.status(200).json({
      raffleId,
      soldCount: Object.keys(tickets).length,
      tickets
    });
  } catch (error) {
    console.error('[raffle-tickets] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}