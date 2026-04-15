const MP_API_BASE = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MP_ACCESS_TOKEN environment variable');
  }
  return token;
}

function sanitizeExternalReference(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_|,:.-]/g, '')
    .slice(0, 240);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const token = getAccessToken();
    const body = req.body || {};

    const transactionAmount = Number(body.transaction_amount || 0);
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({ error: 'transaction_amount is required and must be > 0' });
    }

    const paymentMethodId = String(body.payment_method_id || '');
    if (!paymentMethodId) {
      return res.status(400).json({ error: 'payment_method_id is required' });
    }

    const payer = body.payer || {};
    const payerEmail = String(payer.email || '').trim();
    if (!payerEmail) {
      return res.status(400).json({ error: 'payer.email is required' });
    }

    const payload = {
      transaction_amount: Number(transactionAmount.toFixed(2)),
      description: String(body.description || 'Pagamento de rifa').slice(0, 256),
      payment_method_id: paymentMethodId,
      payer: {
        email: payerEmail,
        first_name: String(payer.first_name || '').slice(0, 120),
        last_name: String(payer.last_name || '').slice(0, 120),
        identification: payer.identification || undefined
      },
      external_reference: sanitizeExternalReference(body.external_reference),
      metadata: body.metadata || {}
    };

    if (body.token) {
      payload.token = String(body.token);
    }
    if (body.installments) {
      payload.installments = Number(body.installments);
    }
    if (body.issuer_id) {
      payload.issuer_id = String(body.issuer_id);
    }

    const response = await fetch(`${MP_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Mercado Pago payment creation failed',
        details: data
      });
    }

    return res.status(200).json({
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      payment_method_id: data.payment_method_id,
      point_of_interaction: data.point_of_interaction || null,
      transaction_details: data.transaction_details || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
