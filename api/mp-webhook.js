const MP_API_BASE = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MP_ACCESS_TOKEN environment variable');
  }
  return token;
}

export default async function handler(req, res) {
  // Minimal webhook endpoint for Mercado Pago notifications.
  // This endpoint confirms receipt and fetches payment status when possible.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const topic = String(req.query.topic || req.body?.type || '').toLowerCase();
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.body?.id;

    if (topic.includes('payment') && paymentId) {
      const token = getAccessToken();
      const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        console.log('Webhook payment update', {
          id: data.id,
          status: data.status,
          status_detail: data.status_detail,
          external_reference: data.external_reference
        });
      } else {
        console.warn('Webhook fetch payment failed', { paymentId, data });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
