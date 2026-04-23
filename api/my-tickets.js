import { listTicketsByDocument } from './_lib/neon.js';

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function statusToLabel(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') {
    return 'Confirmado';
  }
  if (['pending', 'in_process', 'payment_created', 'creating_payment'].includes(value)) {
    return 'Pendente';
  }
  if (['rejected', 'cancelled', 'payment_failed'].includes(value)) {
    return 'Recusado';
  }
  return value ? value : 'Sem status';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const documentInput = String(req.query.document || '').trim();
    const digits = normalizeDigits(documentInput);

    if (!digits) {
      return res.status(400).json({ error: 'document query param is required' });
    }

    if (digits.length < 10) {
      return res.status(400).json({ error: 'Informe um CPF ou telefone valido' });
    }

    const rows = await listTicketsByDocument(digits);
    const tickets = [];

    for (const row of rows) {
      const rawNumbers = String(row.selected_numbers_csv || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      for (const number of rawNumbers) {
        tickets.push({
          raffleId: row.raffle_id || null,
          raffleTitle: row.raffle_title || 'Rifa',
          number,
          status: row.mp_status || row.status || null,
          statusLabel: statusToLabel(row.mp_status || row.status),
          createdAt: row.created_at || null,
          externalReference: row.external_reference || null
        });
      }
    }

    return res.status(200).json({
      count: tickets.length,
      tickets
    });
  } catch (error) {
    console.error('[my-tickets] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
