const MP_API_BASE = 'https://api.mercadopago.com';
import { insertPaymentEvent } from './_lib/neon.js';

function getAccessToken() {
  const token =
    process.env.MP_ACCESS_TOKEN ||
    process.env.AccessToken ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MP_ACCESS_TOKEN environment variable');
  }
  return String(token).trim();
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
        await insertPaymentEvent({
          source: 'mp-webhook',
          paymentId: String(data.id || paymentId),
          externalReference: String(data.external_reference || ''),
          status: String(data.status || ''),
          statusDetail: String(data.status_detail || ''),
          paymentMethodId: String(data.payment_method_id || ''),
          amount: Number(data.transaction_amount || 0),
          rawPayload: {
            query: req.query,
            body: req.body,
            payment: data
          }
        });

        console.log('Webhook payment update', {
          id: data.id,
          status: data.status,
          status_detail: data.status_detail,
          external_reference: data.external_reference
        });
      } else {
        await insertPaymentEvent({
          source: 'mp-webhook',
          paymentId: String(paymentId),
          status: 'error',
          statusDetail: data?.message || data?.error || 'mp_webhook_fetch_failed',
          rawPayload: {
            query: req.query,
            body: req.body,
            payment: data
          }
        });

        console.warn('Webhook fetch payment failed', { paymentId, data });
      }
    } else {
      await insertPaymentEvent({
        source: 'mp-webhook',
        paymentId: paymentId ? String(paymentId) : null,
        status: 'ignored',
        statusDetail: 'topic_without_payment',
        rawPayload: {
          query: req.query,
          body: req.body
        }
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(error);

    await insertPaymentEvent({
      source: 'mp-webhook',
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
