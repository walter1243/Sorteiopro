const MP_API_BASE = 'https://api.mercadopago.com';
import { insertPaymentEvent } from './_lib/neon.js';

function getAccessToken() {
  const token =
    process.env.MP_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.AccessToken ||
    process.env.ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MP_ACCESS_TOKEN environment variable');
  }
  return String(token).trim();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const token = getAccessToken();
    const paymentId = String(req.query.id || '').trim();

    if (!paymentId) {
      return res.status(400).json({ error: 'id query param is required' });
    }

    const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      await insertPaymentEvent({
        source: 'payment-status',
        paymentId,
        status: 'error',
        statusDetail: data?.message || data?.error || 'mp_status_failed',
        rawPayload: {
          response: data
        }
      });

      return res.status(response.status).json({
        error: 'Mercado Pago payment status request failed',
        details: data
      });
    }

    await insertPaymentEvent({
      source: 'payment-status',
      paymentId: String(data.id || paymentId),
      externalReference: String(data.external_reference || ''),
      status: String(data.status || ''),
      statusDetail: String(data.status_detail || ''),
      paymentMethodId: String(data.payment_method_id || ''),
      amount: Number(data.transaction_amount || 0),
      rawPayload: data
    });

    return res.status(200).json({
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      payment_method_id: data.payment_method_id,
      external_reference: data.external_reference,
      date_approved: data.date_approved || null
    });
  } catch (error) {
    console.error(error);

    await insertPaymentEvent({
      source: 'payment-status',
      status: 'exception',
      statusDetail: error.message || 'internal_server_error',
      rawPayload: {
        error: {
          message: error.message,
          stack: error.stack
        }
      }
    });

    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
