import {
  db,
  appId,
  ensureAuth,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from './firebase-config.js';
import {
  DEFAULT_RAFFLES,
  MP_CONFIG,
  formatCurrency,
  normalizeQuotaNumber,
  showToast,
  statusLabel
} from './common.js';

const ui = {
  raffleCards: document.getElementById('raffle-cards'),
  raffleTitle: document.getElementById('raffle-title'),
  raffleTitleImage: document.getElementById('raffle-title-image'),
  raffleStatus: document.getElementById('raffle-status'),
  instantPrizeAlert: document.getElementById('instant-prize-alert'),
  rafflePrice: document.getElementById('raffle-price'),
  raffleProgressFill: document.getElementById('raffle-progress-fill'),
  raffleProgressTrack: document.querySelector('.raffle-progress-track'),
  winnerAlert: document.getElementById('winner-alert'),
  tabShop: document.getElementById('tab-shop'),
  tabMine: document.getElementById('tab-mine'),
  shopSection: document.getElementById('shop-section'),
  shopGridSection: document.getElementById('shop-grid-section'),
  floatingFeed: document.getElementById('floating-feed'),
  quotaGrid: document.getElementById('quota-grid'),
  selectedCount: document.getElementById('selected-count'),
  selectedTotal: document.getElementById('selected-total'),
  myTicketsPopup: document.getElementById('my-tickets-popup'),
  myTicketsPopupList: document.getElementById('my-tickets-popup-list'),
  myTicketsLookupForm: document.getElementById('my-tickets-lookup-form'),
  myTicketsDocument: document.getElementById('my-tickets-document'),
  myTicketsLookupBtn: document.getElementById('my-tickets-lookup-btn'),
  myTicketsLookupMsg: document.getElementById('my-tickets-lookup-msg'),
  closeMyTicketsPopupBtn: document.getElementById('close-my-tickets-popup'),
  raffleModalOverlay: document.getElementById('modal-sorteio'),
  raffleModalCloseBtn: document.getElementById('close-modal-sorteio'),
  raffleModalTitle: document.getElementById('modal-title'),
  raffleModalStatus: document.getElementById('modal-status'),
  raffleModalImage: document.getElementById('modal-image'),
  raffleModalRafflesList: document.getElementById('modal-raffles-list'),
  raffleModalPrice: document.getElementById('modal-price'),
  raffleModalSelectedInfo: document.getElementById('modal-selected-info'),
  raffleModalConfirmBtn: document.getElementById('modal-confirmar'),
  paymentModal: document.getElementById('payment-modal'),
  closePaymentModalBtn: document.getElementById('close-payment-modal'),
  paymentBrickContainer: document.getElementById('payment-brick-container'),
  prizeClaimModal: document.getElementById('prize-claim-modal'),
  closePrizeClaimBtn: document.getElementById('close-prize-claim'),
  prizeClaimMessage: document.getElementById('prize-claim-message'),
  prizeClaimPix: document.getElementById('prize-claim-pix'),
  sendPrizeClaimBtn: document.getElementById('send-prize-claim'),
  checkoutForm: document.getElementById('checkout-form'),
  buyBtn: document.getElementById('buy-btn'),
  purchaseMsg: document.getElementById('purchase-msg'),
  terms: document.getElementById('terms'),
  name: document.getElementById('name'),
  email: document.getElementById('email'),
  cpf: document.getElementById('cpf'),
  whatsapp: document.getElementById('whatsapp'),
  liveFeedList: document.getElementById('live-feed-list'),
  cookieModal: document.getElementById('cookie-lgpd-modal'),
  cookieCheck: document.getElementById('cookie-consent-check'),
  cookieBtn: document.getElementById('cookie-consent-btn'),
  whatsappFloatBtn: document.getElementById('whatsapp-float-btn'),
  mascoteToggle: document.getElementById('mascote-toggle'),
  mascotePote: document.getElementById('mascote-pote')
};

const state = {
  user: null,
  raffles: DEFAULT_RAFFLES,
  siteWhatsapp: '',
  selectedRaffleId: DEFAULT_RAFFLES[0].id,
  soldTickets: {},
  selectedNumbers: [],
  prizeClaimContext: null,
  pendingPrizeClaims: [],
  checkoutContext: null,
  myTickets: [],
  lookupTickets: [],
  lookupHasSearched: false,
  raffleModal: {
    raffleId: null
  },
  activeTab: 'shop',
  hasPickedRaffle: false,
  quotaVisibleCount: 100,
  quotaScrollUnlocked: false,
  quotaLastRaffleId: null
};

let unsubTickets = null;
let liveFeedTimer = null;
let catalogRefreshTimer = null;
let mpClient = null;
let paymentBrickController = null;
let pixStatusPollTimer = null;
let isPixGenerationInFlight = false;
const WINNER_DISPLAY_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_PRIZE_WHATSAPP_NUMBER = '5563991133386';
const INITIAL_VISIBLE_QUOTAS = 100;
const QUOTA_LOAD_BATCH = 100;
const QUOTA_SCROLL_THRESHOLD_PX = 220;

const fakeNames = [
  'Carlos',
  'Fernanda',
  'Luiz',
  'Amanda',
  'Rafael',
  'Bruna',
  'Diego',
  'Camila',
  'Mateus',
  'Julia'
];

function getProduct() {
  return state.raffles.find((r) => r.id === state.selectedRaffleId) || state.raffles[0];
}

function getRaffleById(raffleId) {
  return state.raffles.find((raffle) => raffle.id === raffleId) || null;
}

function getActiveRaffles() {
  return state.raffles.filter((raffle) => raffle.status === 'active');
}

function getPreferredActiveRaffle() {
  const activeRaffles = getActiveRaffles();
  if (!activeRaffles.length) {
    return null;
  }

  const selected = activeRaffles.find((item) => item.id === state.selectedRaffleId);
  if (selected && String(selected.imageUrl || '').trim()) {
    return selected;
  }

  const withImage = activeRaffles.find((item) => String(item.imageUrl || '').trim());
  return withImage || selected || activeRaffles[0];
}

function getSelectedActiveRaffle() {
  const selected = getRaffleById(state.selectedRaffleId);
  if (selected && selected.status === 'active') {
    return selected;
  }

  return null;
}

function getPrizeMap(product) {
  const entries = Array.isArray(product?.prizeNumbers) ? product.prizeNumbers : [];
  return new Map(entries.map((item) => [String(item.number || '').padStart(3, '0').slice(-3), Number(item.value || 0)]));
}

function ensureQuotaViewportState(product) {
  if (!product) {
    state.quotaLastRaffleId = null;
    state.quotaVisibleCount = INITIAL_VISIBLE_QUOTAS;
    state.quotaScrollUnlocked = false;
    return;
  }

  if (state.quotaLastRaffleId !== product.id) {
    state.quotaLastRaffleId = product.id;
    state.quotaVisibleCount = Math.min(INITIAL_VISIBLE_QUOTAS, Number(product.totalQuotas || 0));
    state.quotaScrollUnlocked = false;
  }
}

function tryLoadMoreQuotasByScroll() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product || state.activeTab !== 'shop') {
    return;
  }

  const totalQuotas = Number(product.totalQuotas || 0);
  if (state.quotaVisibleCount >= totalQuotas) {
    return;
  }

  if (!state.quotaScrollUnlocked) {
    state.quotaScrollUnlocked = true;
  }

  const gridRect = ui.quotaGrid.getBoundingClientRect();
  const reachedLoadZone = gridRect.bottom <= window.innerHeight + QUOTA_SCROLL_THRESHOLD_PX;
  if (!reachedLoadZone) {
    return;
  }

  const nextCount = Math.min(state.quotaVisibleCount + QUOTA_LOAD_BATCH, totalQuotas);
  if (nextCount !== state.quotaVisibleCount) {
    state.quotaVisibleCount = nextCount;
    renderQuotaGrid();
  }
}

function onQuotaWindowScroll() {
  if (!state.hasPickedRaffle) {
    return;
  }

  tryLoadMoreQuotasByScroll();
}

function getSelectedPrizeHits(product) {
  const prizeMap = getPrizeMap(product);
  return state.selectedNumbers
    .filter((number) => prizeMap.has(number))
    .map((number) => ({ number, value: prizeMap.get(number) }));
}

function normalizeWhatsappNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || DEFAULT_PRIZE_WHATSAPP_NUMBER;
}

function buildPrizeWhatsappUrl({ whatsappNumber, name, email, cpf, raffleTitle, quotaNumber, prizeValue, pixKey }) {
  const buyerName = name || 'Nao informado';
  const buyerEmail = email || 'Nao informado';
  const buyerCpf = cpf || 'Nao informado';

  const text = [
    'Ola! Tenho cota premiada para validar.',
    `Nome: ${buyerName}`,
    `E-mail: ${buyerEmail}`,
    `CPF: ${buyerCpf}`,
    `Rifa: ${raffleTitle}`,
    `Cota premiada: ${quotaNumber}`,
    `Valor do premio: R$ ${formatCurrency(prizeValue)}`,
    `Chave Pix: ${pixKey}`
  ].join('\n');

  return `https://wa.me/${normalizeWhatsappNumber(whatsappNumber)}?text=${encodeURIComponent(text)}`;
}

function closePrizeClaimModal() {
  ui.prizeClaimModal.classList.add('hidden');
  state.prizeClaimContext = null;
}

function openPrizeClaimModal(claim) {
  state.prizeClaimContext = claim;
  ui.prizeClaimMessage.textContent = `Parabens! A cota ${claim.number} foi premiada. Voce recebera R$ ${formatCurrency(claim.value)}.`;
  ui.prizeClaimPix.value = '';
  ui.prizeClaimModal.classList.remove('hidden');
}

function onSendPrizeClaim() {
  const context = state.prizeClaimContext;
  if (!context) {
    return;
  }

  const pixKey = ui.prizeClaimPix.value.trim();
  if (!pixKey) {
    showToast('Informe sua chave Pix para solicitar o premio.');
    return;
  }

  const whatsappUrl = buildPrizeWhatsappUrl({
    whatsappNumber: context.whatsappNumber,
    name: context.name,
    email: context.email,
    cpf: context.cpf,
    raffleTitle: context.raffleTitle,
    quotaNumber: context.number,
    prizeValue: context.value,
    pixKey
  });

  const opened = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    showToast('Nao foi possivel abrir o WhatsApp automaticamente.');
    return;
  }

  showToast('Solicitacao de premio enviada para o WhatsApp do administrador.');

  state.pendingPrizeClaims.shift();
  persistPendingPrizeClaims();
  if (state.pendingPrizeClaims.length) {
    openPrizeClaimModal(state.pendingPrizeClaims[0]);
    return;
  }

  closePrizeClaimModal();
}

function persistPendingPrizeClaims() {}

function renderInstantPrizeAlert(product) {
  // Nao revela cotas premiadas antes da compra ser aprovada.
  ui.instantPrizeAlert.classList.add('hidden');
  ui.instantPrizeAlert.textContent = '';
}

function hasVisibleWinner(winner) {
  if (!winner?.date) {
    return false;
  }

  const winnerTime = new Date(winner.date).getTime();
  if (Number.isNaN(winnerTime)) {
    return false;
  }

  return Date.now() - winnerTime <= WINNER_DISPLAY_MS;
}

function renderRaffleCards() {
  const raffle = getSelectedActiveRaffle() || getPreferredActiveRaffle();

  if (!raffle) {
    ui.raffleCards.innerHTML = '<p class="muted">Nenhuma rifa ativa no momento.</p>';
    return;
  }

  ui.raffleCards.innerHTML = `
    <button class="raffle-card active" data-id="${raffle.id}">
      <p class="status">${statusLabel(raffle.status)}</p>
      ${raffle.imageUrl ? `<img src="${raffle.imageUrl}" alt="Premio" class="card-image" crossorigin="anonymous" loading="lazy" decoding="async" />` : ''}
      <strong>${raffle.prizeName || raffle.title}</strong>
      <p>R$ ${formatCurrency(raffle.price)} por cota</p>
      <span class="raffle-card-action">Trocar sorteio</span>
    </button>
  `;

  [...ui.raffleCards.querySelectorAll('button[data-id]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      openRaffleSelectionModal(btn.dataset.id);
    });
  });
}

function renderRaffleSelectionModal() {
  const activeRaffles = getActiveRaffles();
  if (!activeRaffles.length) {
    ui.raffleModalTitle.textContent = 'Nenhuma rifa ativa';
    ui.raffleModalStatus.textContent = 'Status: -';
    ui.raffleModalPrice.textContent = 'R$ 0,00 por cota';
    ui.raffleModalSelectedInfo.textContent = 'Nenhum sorteio selecionado.';
    ui.raffleModalRafflesList.innerHTML = '<p class="muted">Nao existem sorteios ativos no momento.</p>';
    ui.raffleModalImage.classList.add('hidden');
    ui.raffleModalConfirmBtn.disabled = true;
    return;
  }

  const selected = getRaffleById(state.raffleModal.raffleId) || activeRaffles[0];
  state.raffleModal.raffleId = selected.id;

  ui.raffleModalTitle.textContent = selected.prizeName || selected.title || 'Rifa';
  ui.raffleModalStatus.textContent = `Status: ${statusLabel(selected.status)}`;
  ui.raffleModalPrice.textContent = `R$ ${formatCurrency(selected.price)} por cota`;

  if (selected.imageUrl) {
    ui.raffleModalImage.crossOrigin = 'anonymous';
    ui.raffleModalImage.src = selected.imageUrl;
    ui.raffleModalImage.classList.remove('hidden');
  } else {
    ui.raffleModalImage.src = '';
    ui.raffleModalImage.classList.add('hidden');
  }

  ui.raffleModalSelectedInfo.textContent = `Sorteio selecionado: ${selected.prizeName || selected.title || 'Rifa'}`;

  ui.raffleModalRafflesList.innerHTML = activeRaffles
    .map((raffle) => {
      const activeClass = raffle.id === selected.id ? 'active' : '';
      return `
        <button type="button" class="modal-raffle-btn ${activeClass}" data-modal-raffle-id="${raffle.id}">
          <span class="status">${statusLabel(raffle.status)}</span>
          <strong>${raffle.prizeName || raffle.title}</strong>
          <span>R$ ${formatCurrency(raffle.price)} por cota</span>
        </button>
      `;
    })
    .join('');

  [...ui.raffleModalRafflesList.querySelectorAll('button[data-modal-raffle-id]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      state.raffleModal.raffleId = btn.dataset.modalRaffleId;
      renderRaffleSelectionModal();
    });
  });

  ui.raffleModalConfirmBtn.disabled = false;
}

function openRaffleSelectionModal(raffleId) {
  const raffle = getRaffleById(raffleId);
  if (!raffle) {
    return;
  }

  state.raffleModal.raffleId = raffle.id;

  renderRaffleSelectionModal();

  ui.raffleModalOverlay.classList.add('active');
  ui.raffleModalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeRaffleSelectionModal() {
  ui.raffleModalOverlay.classList.remove('active');
  ui.raffleModalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function confirmRaffleSelectionFromModal() {
  const raffle = getRaffleById(state.raffleModal.raffleId);
  if (!raffle) {
    return;
  }

  state.selectedRaffleId = raffle.id;
  state.selectedNumbers = [];
  state.soldTickets = {};
  state.hasPickedRaffle = true;
  state.quotaLastRaffleId = null;
  closeRaffleSelectionModal();
  subscribeTickets();
  render();
}

async function closePaymentModal() {
  ui.paymentModal.classList.add('hidden');
  resetPaymentModal();
  if (pixStatusPollTimer) {
    clearInterval(pixStatusPollTimer);
    pixStatusPollTimer = null;
  }
}

function resetPaymentModal() {
  // Reset Step 1
  const methodBtns = document.querySelectorAll('.payment-method-btn');
  methodBtns.forEach(btn => btn.classList.remove('active'));
  
  // Show step 1, hide others
  document.getElementById('payment-step-1').classList.remove('hidden');
  document.getElementById('payment-step-2-card').classList.add('hidden');
  document.getElementById('payment-step-2-pix').classList.add('hidden');
  document.getElementById('payment-loading').classList.add('hidden');
  document.getElementById('payment-success').classList.add('hidden');
  
  // Reset form
  document.getElementById('card-payment-form').reset();
  document.getElementById('card-holder-name').value = '';
  document.getElementById('card-number').value = '';
  document.getElementById('card-expiry').value = '';
  document.getElementById('card-cvv').value = '';

  // Reset PIX display
  const pixQrEl = document.getElementById('pix-qr-code');
  const pixKeyEl = document.getElementById('pix-key');
  if (pixQrEl) {
    pixQrEl.innerHTML = '';
  }
  if (pixKeyEl) {
    pixKeyEl.value = '';
  }

  isPixGenerationInFlight = false;
}

async function openPaymentModal(checkoutContext) {
  state.checkoutContext = checkoutContext;
  resetPaymentModal();
  ui.paymentModal.classList.remove('hidden');
  
  // Set handlers directly to avoid duplicated listeners after re-opening modal
  document.getElementById('payment-method-pix').onclick = () => selectPaymentMethod('pix');
  document.getElementById('payment-method-card').onclick = () => selectPaymentMethod('card');
}

function selectPaymentMethod(method) {
  // Update active button
  const methodBtns = document.querySelectorAll('.payment-method-btn');
  methodBtns.forEach(btn => {
    if (btn.dataset.method === method) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Show corresponding step 2
  document.getElementById('payment-step-1').classList.add('hidden');
  document.getElementById('payment-step-2-card').classList.toggle('hidden', method !== 'card');
  document.getElementById('payment-step-2-pix').classList.toggle('hidden', method !== 'pix');
  
  // Generate PIX immediately when user selects PIX to avoid blank waiting state.
  if (method === 'pix' && state.checkoutContext && !state.checkoutContext.paymentId && !isPixGenerationInFlight) {
    processPixPayment().catch((error) => {
      console.error(error);
      showToast(error?.message || 'Erro ao gerar PIX.');
    });
  }
}

function generatePixCode(pixQrCodeString, pixQrCodeBase64) {
  const pixQR = document.getElementById('pix-qr-code');
  const pixKeyTextarea = document.getElementById('pix-key');
  
  // Clear previous QR codes
  pixQR.innerHTML = '';
  
  if (pixQrCodeBase64) {
    // Use base64 image from Mercado Pago directly (most reliable)
    const cleanBase64 = String(pixQrCodeBase64).replace(/\s+/g, '');
    const img = document.createElement('img');
    img.src = cleanBase64.startsWith('data:image/') ? cleanBase64 : `data:image/png;base64,${cleanBase64}`;
    img.alt = 'QR Code PIX';
    img.style.cssText = 'width:180px;height:180px;display:block;';
    img.onerror = () => {
      // If base64 image fails, fallback to QR string generation
      if (pixQrCodeString && typeof QRCode !== 'undefined') {
        pixQR.innerHTML = '';
        new QRCode(pixQR, {
          text: pixQrCodeString,
          width: 180,
          height: 180,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L
        });
        return;
      }
      pixQR.innerHTML = '❌ Falha ao carregar imagem do QR';
    };
    pixQR.appendChild(img);
  } else if (pixQrCodeString) {
    // Fallback: generate QR code using qrcode.js library
    try {
      new QRCode(pixQR, {
        text: pixQrCodeString,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      pixQR.innerHTML = '❌ Erro ao gerar QR Code';
      return;
    }
  } else {
    pixQR.innerHTML = '❌ QR Code não disponível';
    return;
  }
  
  // Set the PIX key
  pixKeyTextarea.value = pixQrCodeString || '';
  
  // Add copy button listener
  document.getElementById('copy-pix-key-btn').addEventListener('click', async () => {
    try {
      if (navigator.clipboard && pixKeyTextarea.value) {
        await navigator.clipboard.writeText(pixKeyTextarea.value);
      } else {
        pixKeyTextarea.select();
        document.execCommand('copy');
      }
      showToast('Chave PIX copiada!');
    } catch (copyError) {
      console.warn('[generatePixCode] Falha ao copiar chave PIX:', copyError);
      showToast('Nao foi possivel copiar automaticamente.');
    }
  }, { once: true });
}

function extractPixData(payment) {
  const transactionData = payment?.point_of_interaction?.transaction_data;
  return {
    qrCode: transactionData?.qr_code || payment?.qr_code || null,
    qrCodeBase64: transactionData?.qr_code_base64 || payment?.qr_code_base64 || null,
    ticketUrl: transactionData?.ticket_url || payment?.ticket_url || null
  };
}

function isFirebaseUnavailableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('auth/invalid-api-key') || message.includes('firebase');
}

async function processCardPayment(cardHolder, cardNumber, expiry, cvv) {
  const checkoutContext = state.checkoutContext;
  if (!checkoutContext) {
    throw new Error('Checkout sem contexto.');
  }

  // Format card data
  const [expiryMonth, expiryYear] = expiry.split('/');
  const cardPayload = {
    transaction_amount: Number(checkoutContext.totalAmount.toFixed(2)),
    description: `Rifa - ${checkoutContext.product.prizeName || checkoutContext.product.title}`,
    payment_method_id: 'card',
    payer: {
      email: checkoutContext.buyer.email,
      first_name: checkoutContext.buyer.name.split(' ')[0] || checkoutContext.buyer.name,
      last_name: checkoutContext.buyer.name.split(' ').slice(1).join(' ') || '-',
      identification: {
        type: 'CPF',
        number: checkoutContext.buyer.cpf.replace(/\D/g, '')
      }
    },
    card: {
      number: cardNumber.replace(/\s/g, ''),
      expiration_month: expiryMonth,
      expiration_year: expiryYear,
      security_code: cvv,
      cardholder: {
        name: cardHolder
      }
    },
    external_reference: `${checkoutContext.product.id}|${checkoutContext.selectedNumbers.join(',')}`,
    metadata: {
      raffleId: checkoutContext.product.id,
      selectedNumbers: checkoutContext.selectedNumbers.join(',')
    }
  };

  showLoadingAnimation(true);
  
  try {
    const paymentResponse = await fetch('/api/create-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cardPayload)
    });

    const payment = await paymentResponse.json();
    
    if (!paymentResponse.ok) {
      throw new Error(payment?.message || 'Erro ao processar pagamento.');
    }

    checkoutContext.paymentMethod = 'card';
    checkoutContext.paymentId = payment.id;

    if (payment.status === 'approved') {
      await saveApprovedTickets(checkoutContext);
      await applyPrizeClaimFlow(checkoutContext);
      state.selectedNumbers = [];
      showSuccessMessage('Pagamento aprovado! Suas cotas foram compradas.');
      return;
    }

    throw new Error(`Pagamento em status: ${payment.status}`);
  } finally {
    showLoadingAnimation(false);
  }
}

async function processPixPayment() {
  const checkoutContext = state.checkoutContext;
  if (!checkoutContext) {
    throw new Error('Checkout sem contexto.');
  }

  if (isPixGenerationInFlight) {
    return;
  }
  isPixGenerationInFlight = true;

  // Validate CPF format
  const cpfDigits = checkoutContext.buyer.cpf.replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    throw new Error('CPF inválido. Deve ter 11 dígitos.');
  }
  // Check for obvious invalid patterns
  const allSame = /^(\d)\1{10}$/.test(cpfDigits);
  if (allSame) {
    throw new Error('CPF inválido. Todos os dígitos são iguais.');
  }

  const pixPayload = {
    transaction_amount: Number(checkoutContext.totalAmount.toFixed(2)),
    description: `Rifa - ${checkoutContext.product.prizeName || checkoutContext.product.title}`,
    payment_method_id: 'pix',
    payer: {
      email: checkoutContext.buyer.email,
      first_name: checkoutContext.buyer.name.split(' ')[0] || checkoutContext.buyer.name,
      last_name: checkoutContext.buyer.name.split(' ').slice(1).join(' ') || '-',
      identification: {
        type: 'CPF',
        number: cpfDigits
      }
    },
    external_reference: `${checkoutContext.product.id}|${checkoutContext.selectedNumbers.join(',')}`,
    metadata: {
      raffleId: checkoutContext.product.id,
      selectedNumbers: checkoutContext.selectedNumbers.join(',')
    }
  };

  showLoadingAnimation(true);

  try {
    const paymentResponse = await fetch('/api/create-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pixPayload)
    });

    const payment = await paymentResponse.json();

    if (!paymentResponse.ok) {
      throw new Error(payment?.message || 'Erro ao gerar PIX.');
    }

    console.log('[processPixPayment] Resposta completa:', payment);
    console.log('[processPixPayment] point_of_interaction:', payment.point_of_interaction);

    checkoutContext.paymentMethod = 'pix';
    checkoutContext.paymentId = payment.id;

    if (payment.status === 'pending' && payment.payment_method_id === 'pix') {
      showLoadingAnimation(false);
      
      // Extract PIX QR code from create-payment response
      let { qrCode: pixQrCode, qrCodeBase64: pixQrCodeBase64, ticketUrl } = extractPixData(payment);

      // Fallback: sometimes MP returns pending first and fills QR moments later
      if (!pixQrCode && !pixQrCodeBase64) {
        console.warn('[processPixPayment] QR não veio no create-payment. Tentando payment-status...');
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          try {
            const statusData = await fetchPaymentStatus(payment.id);
            const extracted = extractPixData(statusData);
            pixQrCode = extracted.qrCode;
            pixQrCodeBase64 = extracted.qrCodeBase64;
            ticketUrl = extracted.ticketUrl || ticketUrl;
            if (pixQrCode || pixQrCodeBase64) {
              console.log(`[processPixPayment] QR encontrado no payment-status (tentativa ${attempt}).`);
              break;
            }
          } catch (statusError) {
            console.warn('[processPixPayment] Falha ao buscar payment-status:', statusError?.message || statusError);
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      console.log('[processPixPayment] QR Code (string):', pixQrCode ? pixQrCode.substring(0, 50) + '...' : 'NÃO ENCONTRADO');
      console.log('[processPixPayment] QR Code (base64):', pixQrCodeBase64 ? pixQrCodeBase64.substring(0, 30) + '...' : 'NÃO ENCONTRADO');
      
      if (pixQrCode || pixQrCodeBase64) {
        generatePixCode(pixQrCode, pixQrCodeBase64);
      } else {
        console.warn('[processPixPayment] QR Code não encontrado!');
        console.warn('[processPixPayment] Resposta completa:', JSON.stringify(payment, null, 2));
        if (ticketUrl) {
          document.getElementById('pix-qr-code').innerHTML = `<a href="${ticketUrl}" target="_blank" rel="noopener noreferrer">Abrir boleto/QR do Mercado Pago</a>`;
        } else {
          document.getElementById('pix-qr-code').innerHTML = '⚠️ Erro ao gerar QR Code. Use a chave abaixo.';
        }
      }
      
      // Show step 2 with generated QR code
      document.getElementById('payment-step-2-pix').classList.remove('hidden');
      
      showToast('PIX gerado! Escaneie o QR Code ou copie a chave.');
      startPixStatusPolling(checkoutContext);
      return;
    }

    if (payment.status === 'approved') {
      await saveApprovedTickets(checkoutContext);
      await applyPrizeClaimFlow(checkoutContext);
      state.selectedNumbers = [];
      showSuccessMessage('PIX aprovado! Suas cotas foram compradas.');
    } else {
      throw new Error(`Status inesperado: ${payment.status}`);
    }
  } catch (err) {
    showLoadingAnimation(false);
    throw err;
  } finally {
    isPixGenerationInFlight = false;
  }
}

function showLoadingAnimation(show) {
  document.getElementById('payment-loading').classList.toggle('hidden', !show);
  if (show) {
    document.getElementById('payment-step-1').classList.add('hidden');
    document.getElementById('payment-step-2-card').classList.add('hidden');
    document.getElementById('payment-step-2-pix').classList.add('hidden');
  }
}

function showSuccessMessage(message) {
  const successDiv = document.getElementById('payment-success');
  const messageP = document.getElementById('payment-success-message');
  
  messageP.textContent = message;
  
  document.getElementById('payment-step-1').classList.add('hidden');
  document.getElementById('payment-step-2-card').classList.add('hidden');
  document.getElementById('payment-step-2-pix').classList.add('hidden');
  document.getElementById('payment-loading').classList.add('hidden');
  successDiv.classList.remove('hidden');
  
  const closeBtn = document.getElementById('success-close-btn');
  closeBtn.addEventListener('click', async () => {
    await closePaymentModal();
    render();
  }, { once: true });
}

async function saveApprovedTickets(checkoutContext) {
  if (checkoutContext.ticketsReleased) {
    return;
  }

  try {
    for (const num of checkoutContext.selectedNumbers) {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', `tickets_${checkoutContext.product.id}`, num);
      const check = await getDoc(ticketRef);
      if (check.exists()) {
        throw new Error(`A cota ${num} ja foi comprada por outra pessoa.`);
      }
    }

    for (const num of checkoutContext.selectedNumbers) {
      const payload = {
        number: num,
        buyerName: checkoutContext.buyer.name,
        buyerEmail: checkoutContext.buyer.email,
        buyerCpf: checkoutContext.buyer.cpf,
        buyerWhatsapp: checkoutContext.buyer.whatsapp || '',
        status: 'approved',
        raffleId: checkoutContext.product.id,
        raffleTitle: checkoutContext.product.prizeName || checkoutContext.product.title,
        paymentMethod: checkoutContext.paymentMethod || '-',
        paymentId: checkoutContext.paymentId || '-',
        date: new Date().toISOString(),
        uid: state.user.uid,
        lgpdConsent: true
      };

      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `tickets_${checkoutContext.product.id}`, num), payload);
      await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'purchases', `${checkoutContext.product.id}_${num}`), payload);
    }
  } catch (error) {
    if (isFirebaseUnavailableError(error)) {
      console.warn('[saveApprovedTickets] Firebase indisponivel, pulando persistencia local:', error);
      showToast('Pagamento aprovado, mas Firebase indisponivel no momento.');
      checkoutContext.ticketsReleased = true;
      return;
    }
    throw error;
  }

  checkoutContext.ticketsReleased = true;
}

async function applyPrizeClaimFlow(checkoutContext) {
  const selectedPrizeHits = getSelectedPrizeHits(checkoutContext.product).filter((item) =>
    checkoutContext.selectedNumbers.includes(item.number)
  );

  if (!selectedPrizeHits.length) {
    return;
  }

  state.pendingPrizeClaims = selectedPrizeHits.map((item) => ({
    number: item.number,
    value: item.value,
    whatsappNumber: checkoutContext.product.prizeWhatsapp || DEFAULT_PRIZE_WHATSAPP_NUMBER,
    name: checkoutContext.buyer.name,
    email: checkoutContext.buyer.email,
    cpf: checkoutContext.buyer.cpf,
    raffleTitle: checkoutContext.product.prizeName || checkoutContext.product.title
  }));
  persistPendingPrizeClaims();
  openPrizeClaimModal(state.pendingPrizeClaims[0]);
}

async function fetchPaymentStatus(paymentId) {
  const response = await fetch(`/api/payment-status?id=${encodeURIComponent(String(paymentId))}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao consultar status do pagamento.');
  }
  return data;
}

function startPixStatusPolling(checkoutContext) {
  if (pixStatusPollTimer) {
    clearInterval(pixStatusPollTimer);
  }

  let attempts = 0;
  pixStatusPollTimer = setInterval(async () => {
    attempts += 1;

    try {
      const statusData = await fetchPaymentStatus(checkoutContext.paymentId);
      const status = String(statusData.status || '').toLowerCase();

      if (status === 'approved') {
        clearInterval(pixStatusPollTimer);
        pixStatusPollTimer = null;

        await saveApprovedTickets(checkoutContext);
        await applyPrizeClaimFlow(checkoutContext);

        state.selectedNumbers = [];
        render();
        showToast('PIX aprovado! Cotas liberadas com sucesso.');
        return;
      }

      if (['rejected', 'cancelled'].includes(status) || attempts >= 60) {
        clearInterval(pixStatusPollTimer);
        pixStatusPollTimer = null;
        showToast(status === 'approved' ? 'Pagamento aprovado.' : 'Pagamento PIX nao aprovado no prazo.');
      }
    } catch (error) {
      console.error(error);
    }
  }, 8000);
}

function renderQuotaGrid() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product) {
    ui.quotaGrid.innerHTML = '';
    return;
  }

  ensureQuotaViewportState(product);

  const quickWinners = new Set(
    (Array.isArray(product.quickDrawWinners) ? product.quickDrawWinners : [])
      .map((w) => normalizeQuotaNumber(w?.number))
  );

  const totalQuotas = Number(product.totalQuotas || 0);
  const visibleLimit = Math.min(state.quotaVisibleCount, totalQuotas);

  ui.quotaGrid.innerHTML = '';

  for (let i = 0; i < visibleLimit; i += 1) {
    const number = normalizeQuotaNumber(i);
    const sold = !!state.soldTickets[number];
    const selected = state.selectedNumbers.includes(number);
    const isQuickWinner = quickWinners.has(number);

    const button = document.createElement('button');
    button.textContent = number;
    button.className = `quota ${sold ? 'sold' : ''} ${selected ? 'selected' : ''} ${isQuickWinner ? 'quick-winner' : ''}`.trim();

    button.addEventListener('click', () => {
      if (sold || product.status !== 'active') {
        return;
      }

      if (state.selectedNumbers.includes(number)) {
        state.selectedNumbers = state.selectedNumbers.filter((n) => n !== number);
      } else {
        state.selectedNumbers.push(number);
      }

      renderSelection();
      renderQuotaGrid();
    });

    ui.quotaGrid.appendChild(button);
  }

  if (visibleLimit < totalQuotas) {
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.style.gridColumn = '1 / -1';
    hint.style.textAlign = 'center';
    hint.textContent = `Exibindo ${visibleLimit} de ${totalQuotas} cotas. Role para carregar mais.`;
    ui.quotaGrid.appendChild(hint);
  }
}

function renderSelection() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product) {
    ui.selectedCount.textContent = '0';
    ui.selectedTotal.textContent = 'R$ 0,00';
    ui.purchaseMsg.textContent = 'Escolha uma rifa ativa na vitrine para continuar.';
    ui.buyBtn.disabled = true;
    renderInstantPrizeAlert(null);
    return;
  }

  const total = state.selectedNumbers.length * Number(product.price);
  ui.selectedCount.textContent = state.selectedNumbers.length;
  ui.selectedTotal.textContent = `R$ ${formatCurrency(total)}`;

  if (product.status !== 'active') {
    ui.purchaseMsg.textContent = 'Esta rifa nao esta ativa. Escolha uma rifa ativa para comprar.';
  } else {
    ui.purchaseMsg.textContent = '';
  }

  ui.buyBtn.disabled = product.status !== 'active';

  renderInstantPrizeAlert(product);
}

function renderHeader() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product) {
    ui.raffleTitle.textContent = 'Escolha uma rifa ativa';
    ui.raffleTitleImage.classList.add('hidden');
    ui.raffleTitleImage.src = '';
    ui.raffleStatus.textContent = '-';
    ui.instantPrizeAlert.classList.add('hidden');
    ui.instantPrizeAlert.textContent = '';
    ui.rafflePrice.textContent = 'Progresso da rifa: 0,0%';
    ui.raffleProgressFill.style.width = '0%';
    ui.raffleProgressTrack.setAttribute('aria-valuenow', '0');
    ui.winnerAlert.textContent = '';
    ui.winnerAlert.classList.add('hidden');
    return;
  }

  ui.raffleTitle.textContent = product.prizeName || product.title;
  ui.raffleStatus.textContent = statusLabel(product.status);
  const sold = Object.keys(state.soldTickets).length;
  const total = Number(product.totalQuotas || 0);
  const percent = total > 0 ? (sold / total) * 100 : 0;
  const percentLabel = percent.toFixed(1).replace('.', ',');
  const percentClamped = Math.max(0, Math.min(100, percent));
  ui.rafflePrice.textContent = `Progresso da rifa: ${percentLabel}%`;
  ui.raffleProgressFill.style.width = `${percentClamped}%`;
  ui.raffleProgressTrack.setAttribute('aria-valuenow', String(percentClamped.toFixed(1)));

  ui.raffleTitleImage.classList.add('hidden');
  ui.raffleTitleImage.src = '';

  if (hasVisibleWinner(product.winner)) {
    const mine = state.myTickets.find(
      (t) => t.raffleId === product.id && t.number === product.winner.number
    );

    if (mine) {
      ui.winnerAlert.innerHTML = `Parabens! Sua cota <strong>${product.winner.number}</strong> foi sorteada nessa rifa.`;
      ui.winnerAlert.classList.remove('hidden');
    } else {
      ui.winnerAlert.textContent = `Numero sorteado: ${product.winner.number} | Vencedor: ${product.winner.buyerName || 'Nao informado'}`;
      ui.winnerAlert.classList.remove('hidden');
    }
  } else {
    // Show quick-draw winners if any
    const quickWinners = Array.isArray(product.quickDrawWinners) ? product.quickDrawWinners : [];
    if (quickWinners.length) {
      const last = quickWinners[quickWinners.length - 1];
      ui.winnerAlert.innerHTML = `🎁 Cota premiada: <strong>${normalizeQuotaNumber(last.number)}</strong>${last.prizeValue ? ` — R$ ${Number(last.prizeValue).toFixed(2).replace('.', ',')}` : ''}`;
      ui.winnerAlert.classList.remove('hidden');
    } else {
      ui.winnerAlert.textContent = '';
      ui.winnerAlert.classList.add('hidden');
    }
  }
}

function renderMyTickets() {
  if (!state.lookupTickets.length) {
    if (state.lookupHasSearched) {
      ui.myTicketsPopupList.innerHTML = '';
      return;
    }

    ui.myTicketsPopupList.innerHTML = '<p class="muted">Nenhuma cota carregada. Informe seu CPF ou telefone para buscar.</p>';
    return;
  }

  const cards = state.lookupTickets
    .map((t) => `
      <article class="ticket-item">
        <p class="muted">${t.raffleTitle || 'Rifa'}${t.createdAt ? ` • ${new Date(t.createdAt).toLocaleDateString('pt-BR')}` : ''}</p>
        <strong>${t.number || '000'}</strong>
        <p class="muted">${t.statusLabel || 'Confirmado'}</p>
      </article>
    `)
    .join('');

  ui.myTicketsPopupList.innerHTML = cards;
}

function setLookupAlert(message, type = 'info') {
  ui.myTicketsLookupMsg.textContent = message;
  ui.myTicketsLookupMsg.classList.remove('lookup-alert-info', 'lookup-alert-success', 'lookup-alert-error');
  ui.myTicketsLookupMsg.classList.add(`lookup-alert-${type}`);
}

function normalizeLookupDocument(value) {
  return String(value || '').replace(/\D/g, '');
}

async function fetchTicketsByDocument(documentDigits) {
  const response = await fetch(`/api/my-tickets?document=${encodeURIComponent(documentDigits)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao buscar cotas.');
  }
  return data;
}

async function onLookupMyTickets(event) {
  event.preventDefault();

  const documentDigits = normalizeLookupDocument(ui.myTicketsDocument.value);
  if (!documentDigits) {
    setLookupAlert('Informe o CPF ou telefone para buscar suas cotas.', 'error');
    showToast('Informe o CPF ou telefone para buscar suas cotas.');
    return;
  }

  if (documentDigits.length < 10) {
    setLookupAlert('Digite um CPF ou telefone valido.', 'error');
    showToast('Digite um CPF ou telefone valido.');
    return;
  }

  ui.myTicketsLookupBtn.disabled = true;
  setLookupAlert('Buscando cotas...', 'info');

  try {
    const data = await fetchTicketsByDocument(documentDigits);
    state.lookupTickets = Array.isArray(data?.tickets) ? data.tickets : [];
    state.lookupHasSearched = true;

    if (!state.lookupTickets.length) {
      setLookupAlert('Nenhuma cota encontrada para este documento.', 'error');
    } else {
      setLookupAlert(`${state.lookupTickets.length} cota(s) encontrada(s).`, 'success');
    }

    renderMyTickets();
  } catch (error) {
    console.error(error);
    state.lookupTickets = [];
    state.lookupHasSearched = true;
    renderMyTickets();
    setLookupAlert(error?.message || 'Erro ao buscar cotas.', 'error');
    showToast(error?.message || 'Erro ao buscar cotas.');
  } finally {
    ui.myTicketsLookupBtn.disabled = false;
  }
}

function render() {
  renderRaffleCards();
  renderHeader();
  renderQuotaGrid();
  renderSelection();
  renderMyTickets();
  renderTabs();
}

function renderTabs() {
  const mineActive = state.activeTab === 'mine';

  ui.tabMine.classList.toggle('active', mineActive);
  ui.tabShop.classList.toggle('active', !mineActive);

  ui.shopSection.classList.remove('hidden');
  ui.shopGridSection.classList.toggle('hidden', !state.hasPickedRaffle);
}

function handleActiveRaffleFlow() {
  const selected = getSelectedActiveRaffle();
  if (selected) {
    state.hasPickedRaffle = true;
    return;
  }

  const preferred = getPreferredActiveRaffle();
  if (!preferred) {
    state.hasPickedRaffle = false;
    return;
  }

  state.selectedRaffleId = preferred.id;
  state.hasPickedRaffle = true;
  state.quotaLastRaffleId = null;
}

function addLiveFeedMessage() {
  const product = getProduct();
  if (!product) {
    return;
  }

  const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
  const qtd = Math.floor(Math.random() * 5) + 1;
  const div = document.createElement('div');
  div.className = 'floating-msg';
  div.textContent = `${name} acabou de comprar ${qtd} cota(s).`;

  ui.floatingFeed.prepend(div);
  setTimeout(() => {
    div.remove();
  }, 5200);
}

function startLiveFeed() {
  if (liveFeedTimer) {
    clearInterval(liveFeedTimer);
  }

  addLiveFeedMessage();
  liveFeedTimer = setInterval(addLiveFeedMessage, 8000);
}

function setupCookieConsent() {
  const accepted = localStorage.getItem('lgpd_cookie_accepted') === 'true';
  if (!accepted) {
    ui.cookieModal.classList.remove('hidden');
  }

  ui.cookieBtn.addEventListener('click', () => {
    if (!ui.cookieCheck.checked) {
      showToast('Confirme a caixa de LGPD para continuar.');
      return;
    }

    localStorage.setItem('lgpd_cookie_accepted', 'true');
    ui.cookieModal.classList.add('hidden');
  });
}

function subscribeCatalog() {
  const refreshCatalog = async () => {
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Falha ao carregar catalogo');
      }

      const payload = await response.json();
      const items = Array.isArray(payload.items) && payload.items.length ? payload.items : DEFAULT_RAFFLES;
      state.raffles = items;

      if (!items.some((item) => item.id === state.selectedRaffleId)) {
        state.selectedRaffleId = items.find((item) => item.status === 'active')?.id || items[0].id;
      }

      handleActiveRaffleFlow();
      subscribeTickets();
      render();
    } catch (error) {
      console.error(error);
      if (!state.raffles.length) {
        state.raffles = DEFAULT_RAFFLES;
        state.selectedRaffleId = DEFAULT_RAFFLES[0].id;
        handleActiveRaffleFlow();
        subscribeTickets();
        render();
      }
    }
  };

  refreshCatalog();

  if (catalogRefreshTimer) {
    clearInterval(catalogRefreshTimer);
  }
  catalogRefreshTimer = setInterval(refreshCatalog, 15000);
}

function subscribeTickets() {
  if (unsubTickets) {
    unsubTickets();
  }

  const product = getProduct();
  state.soldTickets = {};
  render();
  const ticketsRef = collection(db, 'artifacts', appId, 'public', 'data', `tickets_${product.id}`);

  unsubTickets = onSnapshot(ticketsRef, (snap) => {
    const sold = {};
    snap.forEach((d) => {
      sold[d.id] = d.data();
    });
    state.soldTickets = sold;
    render();
  });
}

function subscribeMyTickets() {
  const ref = collection(db, 'artifacts', appId, 'users', state.user.uid, 'purchases');

  onSnapshot(ref, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    state.myTickets = list;
    renderMyTickets();
  });
}

async function processCheckout(event) {
  event.preventDefault();

  const product = getProduct();

  if (!ui.terms.checked) {
    showToast('Voce precisa aceitar os termos.');
    return;
  }

  if (product.status !== 'active') {
    showToast('Apenas rifas ativas podem receber compras.');
    return;
  }

  if (!state.selectedNumbers.length) {
    showToast('Selecione ao menos 1 cota.');
    return;
  }

  ui.buyBtn.disabled = true;

  try {
    const checkoutContext = {
      product,
      selectedNumbers: [...state.selectedNumbers],
      totalAmount: state.selectedNumbers.length * Number(product.price),
      buyer: {
        name: ui.name.value.trim(),
        email: ui.email.value.trim(),
        cpf: ui.cpf.value.trim(),
        whatsapp: (ui.whatsapp?.value || '').trim()
      }
    };

    await openPaymentModal(checkoutContext);
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Erro ao processar checkout.');
  } finally {
    ui.buyBtn.disabled = false;
  }
}

function subscribeSiteConfig() {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'siteConfig', 'main');
  onSnapshot(ref, (snap) => {
    const number = (snap.exists() && snap.data().whatsapp) ? snap.data().whatsapp : DEFAULT_PRIZE_WHATSAPP_NUMBER;
    state.siteWhatsapp = number;
    ui.whatsappFloatBtn.href = `https://wa.me/${number}`;
  });
}

async function init() {
  ui.closeMyTicketsPopupBtn.addEventListener('click', () => {
    state.activeTab = 'shop';
    renderTabs();
    ui.myTicketsPopup.classList.add('hidden');
  });
  ui.myTicketsPopup.addEventListener('click', (event) => {
    if (event.target === ui.myTicketsPopup) {
      state.activeTab = 'shop';
      renderTabs();
      ui.myTicketsPopup.classList.add('hidden');
    }
  });

  ui.tabShop.addEventListener('click', () => {
    state.activeTab = 'shop';
    renderTabs();
  });
  ui.tabMine.addEventListener('click', () => {
    state.activeTab = 'mine';
    renderTabs();
    state.lookupHasSearched = false;
    state.lookupTickets = [];
    setLookupAlert('Use o mesmo CPF ou telefone informado na compra.', 'info');
    renderMyTickets();
    ui.myTicketsPopup.classList.remove('hidden');
    ui.myTicketsDocument.focus();
  });
  ui.myTicketsLookupForm.addEventListener('submit', onLookupMyTickets);
  window.addEventListener('scroll', onQuotaWindowScroll, { passive: true });

  ui.raffleModalCloseBtn.addEventListener('click', closeRaffleSelectionModal);
  ui.raffleModalConfirmBtn.addEventListener('click', confirmRaffleSelectionFromModal);
  ui.raffleModalOverlay.addEventListener('click', (event) => {
    if (event.target === ui.raffleModalOverlay) {
      closeRaffleSelectionModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ui.raffleModalOverlay.classList.contains('active')) {
      closeRaffleSelectionModal();
    }
  });

  ui.closePaymentModalBtn.addEventListener('click', () => {
    closePaymentModal();
  });
  ui.paymentModal.addEventListener('click', (event) => {
    if (event.target === ui.paymentModal) {
      closePaymentModal();
    }
  });

  // Card form submission
  document.getElementById('card-payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const cardHolder = document.getElementById('card-holder-name').value.trim();
      const cardNumber = document.getElementById('card-number').value.trim();
      const cardExpiry = document.getElementById('card-expiry').value.trim();
      const cardCvv = document.getElementById('card-cvv').value.trim();

      if (!cardHolder || !cardNumber || !cardExpiry || !cardCvv) {
        showToast('Preencha todos os campos do cartão.');
        return;
      }

      await processCardPayment(cardHolder, cardNumber, cardExpiry, cardCvv);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Erro ao processar cartão.');
    }
  });

  // Back buttons to payment method selection
  document.getElementById('back-to-methods-card').addEventListener('click', () => {
    selectPaymentMethod('');
    document.getElementById('payment-step-1').classList.remove('hidden');
    document.getElementById('payment-step-2-card').classList.add('hidden');
    document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
  });

  document.getElementById('back-to-methods-pix').addEventListener('click', () => {
    selectPaymentMethod('');
    document.getElementById('payment-step-1').classList.remove('hidden');
    document.getElementById('payment-step-2-pix').classList.add('hidden');
    document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
  });

  // Confirmacao manual removida para evitar liberacao indevida de cotas.

  ui.closePrizeClaimBtn.addEventListener('click', closePrizeClaimModal);
  ui.prizeClaimModal.addEventListener('click', (event) => {
    if (event.target === ui.prizeClaimModal) {
      closePrizeClaimModal();
    }
  });
  ui.sendPrizeClaimBtn.addEventListener('click', onSendPrizeClaim);

  // Info modals
  document.querySelectorAll('.footer-link[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.modal);
      if (modal) { modal.classList.remove('hidden'); }
    });
  });
  document.querySelectorAll('.info-modal-close[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.close);
      if (modal) { modal.classList.add('hidden'); }
    });
  });
  document.querySelectorAll('.info-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.classList.add('hidden'); }
    });
  });

  if (ui.mascoteToggle && ui.mascotePote) {
    ui.mascoteToggle.addEventListener('click', () => {
      const willShow = !ui.mascotePote.classList.contains('show');
      ui.mascotePote.classList.toggle('show', willShow);
      ui.mascoteToggle.setAttribute('aria-expanded', String(willShow));
      ui.mascotePote.setAttribute('aria-hidden', String(!willShow));
    });
  }

  // WhatsApp float fallback href
  ui.whatsappFloatBtn.href = `https://wa.me/${DEFAULT_PRIZE_WHATSAPP_NUMBER}`;

  setupCookieConsent();
  startLiveFeed();
  ui.checkoutForm.addEventListener('submit', processCheckout);

  try {
    state.user = await ensureAuth();
    subscribeCatalog();
    subscribeMyTickets();
    subscribeSiteConfig();
  } catch (error) {
    console.error(error);
    state.user = { uid: 'cliente_local' };
    subscribeCatalog();
    handleActiveRaffleFlow();
    render();
    showToast('Modo local ativo para compras. Catalogo de rifas carregado via servidor.');
  }
}

init();
