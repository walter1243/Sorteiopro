const MP_API_BASE = 'https://api.mercadopago.com';
import {
  createPedido,
  insertPaymentEvent,
  updatePedidoByExternalReference,
  upsertRifa
} from './_lib/neon.js';

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

function sanitizeExternalReference(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_|,:.-]/g, '')
    .slice(0, 240);
}

function buildIdempotencyKey(externalReference) {
  const safeRef = String(externalReference || 'payment').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${safeRef}-${Date.now()}-${rand}`;
}

function getNotificationUrl() {
  return process.env.MP_WEBHOOK_URL || 'https://sorteiopro-olive.vercel.app/api/webhook';
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
      notification_url: getNotificationUrl(),
      payer: {
        email: payerEmail,
        first_name: String(payer.first_name || '').slice(0, 120),
        last_name: String(payer.last_name || '').slice(0, 120),
        identification: payer.identification || undefined
      },
      external_reference: sanitizeExternalReference(body.external_reference),
      metadata: body.metadata || {}
    };

    const externalReference = payload.external_reference;
    const raffleId = String(payload.metadata?.raffleId || '').trim() || null;
    const selectedNumbersCsv = String(payload.metadata?.selectedNumbers || '').trim() || null;

    if (!externalReference) {
      return res.status(400).json({ error: 'external_reference is required' });
    }

    // Save order before generating PIX/Card payment in Mercado Pago.
    if (raffleId) {
      await upsertRifa({
        id: raffleId,
        title: String(body.description || 'Rifa sem titulo'),
        price: Number(transactionAmount.toFixed(2)),
        totalQuotas: null,
        status: 'active',
        rawPayload: payload.metadata || {}
      });
    }

    await createPedido({
      externalReference,
      raffleId,
      selectedNumbersCsv,
      amount: Number(transactionAmount.toFixed(2)),
      buyerName: `${String(payer.first_name || '').trim()} ${String(payer.last_name || '').trim()}`.trim() || null,
      buyerEmail: payerEmail,
      buyerCpf: String(payer.identification?.number || '').trim() || null,
      paymentMethodId: paymentMethodId,
      status: 'creating_payment',
      statusDetail: 'saved_before_mp_create',
      rawPayload: {
        request: payload
      }
    });

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
        'Content-Type': 'application/json',
        'X-Idempotency-Key': buildIdempotencyKey(externalReference)
      },
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    let data = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      data = { raw: rawBody };
    }

    if (!response.ok) {
      await updatePedidoByExternalReference(externalReference, {
        status: 'payment_failed',
        statusDetail: 'mp_create_payment_failed',
        mpStatus: String(data?.status || ''),
        mpStatusDetail: String(data?.status_detail || data?.message || response.statusText || ''),
        rawPayload: {
          request: payload,
          response: data
        }
      });

      await insertPaymentEvent({
        source: 'create-payment',
        status: 'error',
        statusDetail: data?.message || data?.error || response.statusText || 'mp_create_payment_failed',
        paymentMethodId: paymentMethodId,
        amount: Number(transactionAmount.toFixed(2)),
        externalReference: payload.external_reference,
        rawPayload: {
          request: payload,
          response: data
        }
      });

      return res.status(response.status).json({
        error: 'Mercado Pago payment creation failed',
        details: data || { message: response.statusText || 'Empty response from Mercado Pago' }
      });
    }

    await updatePedidoByExternalReference(externalReference, {
      paymentId: String(data.id || ''),
      paymentMethodId: String(data.payment_method_id || paymentMethodId || ''),
      status: 'payment_created',
      statusDetail: 'mp_payment_created',
      mpStatus: String(data.status || ''),
      mpStatusDetail: String(data.status_detail || ''),
      rawPayload: {
        request: payload,
        response: data
      }
    });

    await insertPaymentEvent({
      source: 'create-payment',
      paymentId: String(data.id || ''),
      externalReference: String(data.external_reference || payload.external_reference || ''),
      status: String(data.status || ''),
      statusDetail: String(data.status_detail || ''),
      paymentMethodId: String(data.payment_method_id || ''),
      amount: Number(transactionAmount.toFixed(2)),
      rawPayload: {
        request: payload,
        response: data
      }
    });

    return res.status(200).json({
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      payment_method_id: data.payment_method_id,
      point_of_interaction: data.point_of_interaction || null,
      qr_code: data.point_of_interaction?.qr_code || null,
      transaction_details: data.transaction_details || null
    });
  } catch (error) {
    console.error(error);

    await insertPaymentEvent({
      source: 'create-payment',
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
