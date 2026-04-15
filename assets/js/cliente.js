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
  raffleStatus: document.getElementById('raffle-status'),
  instantPrizeAlert: document.getElementById('instant-prize-alert'),
  raffleImage: document.getElementById('raffle-image'),
  rafflePrice: document.getElementById('raffle-price'),
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
  closeMyTicketsPopupBtn: document.getElementById('close-my-tickets-popup'),
  raffleFullscreenPicker: document.getElementById('raffle-fullscreen-picker'),
  raffleFullscreenPickerList: document.getElementById('raffle-fullscreen-picker-list'),
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
  liveFeedList: document.getElementById('live-feed-list'),
  cookieModal: document.getElementById('cookie-lgpd-modal'),
  cookieCheck: document.getElementById('cookie-consent-check'),
  cookieBtn: document.getElementById('cookie-consent-btn')
};

const state = {
  user: null,
  raffles: DEFAULT_RAFFLES,
  selectedRaffleId: DEFAULT_RAFFLES[0].id,
  soldTickets: {},
  selectedNumbers: [],
  prizeClaimContext: null,
  pendingPrizeClaims: [],
  myTickets: [],
  activeTab: 'shop',
  hasPickedRaffle: false
};

let unsubTickets = null;
let liveFeedTimer = null;
const WINNER_DISPLAY_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_PRIZE_WHATSAPP_NUMBER = '5563991133386';

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

function getActiveRaffles() {
  return state.raffles.filter((raffle) => raffle.status === 'active');
}

function getPrizeMap(product) {
  const entries = Array.isArray(product?.prizeNumbers) ? product.prizeNumbers : [];
  return new Map(entries.map((item) => [String(item.number || '').padStart(3, '0').slice(-3), Number(item.value || 0)]));
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

function persistPendingPrizeClaims() {
  if (!state.pendingPrizeClaims.length) {
    localStorage.removeItem('sp_pending_prize_claims');
    return;
  }

  localStorage.setItem('sp_pending_prize_claims', JSON.stringify(state.pendingPrizeClaims));
}

function hasApprovedPaymentInUrl() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get('status') || '').toLowerCase();
  const collectionStatus = (params.get('collection_status') || '').toLowerCase();

  if (status === 'approved' || collectionStatus === 'approved') {
    return true;
  }

  return false;
}

function consumePendingPrizeClaimsAfterApprovedPayment() {
  if (!hasApprovedPaymentInUrl()) {
    return;
  }

  const raw = localStorage.getItem('sp_pending_prize_claims');
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.pendingPrizeClaims = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.pendingPrizeClaims = [];
  }

  if (!state.pendingPrizeClaims.length) {
    localStorage.removeItem('sp_pending_prize_claims');
    return;
  }

  openPrizeClaimModal(state.pendingPrizeClaims[0]);
  showToast('Pagamento aprovado. Agora informe a chave Pix para receber o premio.');

  // Clean URL params to avoid reopening on refresh.
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function renderInstantPrizeAlert(product) {
  if (!state.hasPickedRaffle || !product) {
    ui.instantPrizeAlert.classList.add('hidden');
    ui.instantPrizeAlert.textContent = '';
    return;
  }

  const prizeMap = getPrizeMap(product);
  const hits = state.selectedNumbers
    .filter((number) => prizeMap.has(number))
    .map((number) => ({ number, value: prizeMap.get(number) }));

  if (!hits.length) {
    ui.instantPrizeAlert.classList.add('hidden');
    ui.instantPrizeAlert.textContent = '';
    return;
  }

  if (hits.length === 1) {
    const prize = hits[0];
    ui.instantPrizeAlert.textContent = `Parabens! A cota ${prize.number} e premiada com R$ ${formatCurrency(prize.value)}.`;
  } else {
    const summary = hits.map((item) => `${item.number} (R$ ${formatCurrency(item.value)})`).join(' | ');
    ui.instantPrizeAlert.textContent = `Parabens! Voce selecionou cotas premiadas: ${summary}.`;
  }

  ui.instantPrizeAlert.classList.remove('hidden');
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
  const current = getProduct();
  const activeRaffles = getActiveRaffles();

  if (!activeRaffles.length) {
    ui.raffleCards.innerHTML = '<p class="muted">Nenhuma rifa ativa no momento.</p>';
    return;
  }

  ui.raffleCards.innerHTML = activeRaffles
    .map((raffle) => {
      const activeClass = state.hasPickedRaffle && raffle.id === current.id ? 'active' : '';
      const hasReturnBtn = state.hasPickedRaffle && raffle.id === current.id;
      return `
        <button class="raffle-card ${activeClass}" data-id="${raffle.id}">
          <p class="status">${statusLabel(raffle.status)}</p>
          ${raffle.imageUrl ? `<img src="${raffle.imageUrl}" alt="Premio" class="card-image" />` : ''}
          <strong>${raffle.prizeName || raffle.title}</strong>
          <p>R$ ${formatCurrency(raffle.price)} por cota</p>
          ${hasReturnBtn ? '<span class="raffle-card-action">Escolher outra rifa</span>' : ''}
        </button>
      `;
    })
    .join('');

  [...ui.raffleCards.querySelectorAll('button[data-id]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.hasPickedRaffle && btn.dataset.id === state.selectedRaffleId) {
        if (getActiveRaffles().length > 1) {
          openFullscreenPicker();
        } else {
          state.hasPickedRaffle = false;
          state.selectedNumbers = [];
          render();
        }
        return;
      }

      state.selectedRaffleId = btn.dataset.id;
      state.selectedNumbers = [];
      state.hasPickedRaffle = true;
      closeFullscreenPicker();
      subscribeTickets();
      render();
    });
  });
}

function renderFullscreenPicker(activeRaffles) {
  ui.raffleFullscreenPickerList.innerHTML = activeRaffles
    .map((raffle) => `
      <button class="raffle-card" data-picker-id="${raffle.id}" type="button">
        <p class="status">${statusLabel(raffle.status)}</p>
        ${raffle.imageUrl ? `<img src="${raffle.imageUrl}" alt="Premio" class="card-image" />` : ''}
        <strong>${raffle.prizeName || raffle.title}</strong>
        <p>R$ ${formatCurrency(raffle.price)} por cota</p>
      </button>
    `)
    .join('');

  [...ui.raffleFullscreenPickerList.querySelectorAll('button[data-picker-id]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedRaffleId = btn.dataset.pickerId;
      state.selectedNumbers = [];
      state.hasPickedRaffle = true;
      closeFullscreenPicker();
      subscribeTickets();
      render();
    });
  });
}

function openFullscreenPicker() {
  const activeRaffles = getActiveRaffles();
  if (activeRaffles.length <= 1) {
    closeFullscreenPicker();
    return;
  }

  renderFullscreenPicker(activeRaffles);
  ui.raffleFullscreenPicker.classList.remove('hidden');
}

function closeFullscreenPicker() {
  ui.raffleFullscreenPicker.classList.add('hidden');
}

function renderQuotaGrid() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product) {
    ui.quotaGrid.innerHTML = '';
    return;
  }

  ui.quotaGrid.innerHTML = '';

  for (let i = 0; i < Number(product.totalQuotas); i += 1) {
    const number = normalizeQuotaNumber(i);
    const sold = !!state.soldTickets[number];
    const selected = state.selectedNumbers.includes(number);
    const isPrizeNumber = getPrizeMap(product).has(number);

    const button = document.createElement('button');
    button.innerHTML = `${number}${isPrizeNumber ? '<span class="gift-mark" aria-hidden="true">🎁</span>' : ''}`;
    button.className = `quota ${sold ? 'sold' : ''} ${selected ? 'selected' : ''} ${isPrizeNumber ? 'prized' : ''}`.trim();

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
    ui.raffleStatus.textContent = '-';
    ui.instantPrizeAlert.classList.add('hidden');
    ui.instantPrizeAlert.textContent = '';
    ui.rafflePrice.textContent = 'Selecione uma rifa na vitrine acima para visualizar as cotas.';
    ui.raffleImage.classList.add('hidden');
    ui.raffleImage.src = '';
    ui.winnerAlert.textContent = '';
    ui.winnerAlert.classList.add('hidden');
    return;
  }

  ui.raffleTitle.textContent = product.prizeName || product.title;
  ui.raffleStatus.textContent = statusLabel(product.status);
  const sold = Object.keys(state.soldTickets).length;
  const total = Number(product.totalQuotas || 0);
  const percent = total > 0 ? (sold / total) * 100 : 0;
  ui.rafflePrice.textContent = `Vendas da rifa: ${percent.toFixed(1).replace('.', ',')}%`;

  if (product.imageUrl) {
    ui.raffleImage.src = product.imageUrl;
    ui.raffleImage.classList.remove('hidden');
  } else {
    ui.raffleImage.classList.add('hidden');
    ui.raffleImage.src = '';
  }

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
    ui.winnerAlert.textContent = '';
    ui.winnerAlert.classList.add('hidden');
  }
}

function renderMyTickets() {
  const product = getProduct();
  if (!state.hasPickedRaffle || !product) {
    ui.myTicketsPopupList.innerHTML = '<p class="muted">Escolha uma rifa ativa para visualizar suas cotas.</p>';
    return;
  }

  const currentRaffleTickets = state.myTickets.filter((t) => t.raffleId === product.id);

  if (!currentRaffleTickets.length) {
    ui.myTicketsPopupList.innerHTML = '<p class="muted">Nenhuma cota comprada ainda.</p>';
    return;
  }

  const cards = currentRaffleTickets
    .map((t) => `
      <article class="ticket-item">
        <p class="muted">${t.raffleTitle || 'Rifa'}</p>
        <strong>${t.number || '000'}</strong>
        <p class="muted">${t.status === 'awaiting_payment' ? 'Pendente' : 'Confirmado'}</p>
      </article>
    `)
    .join('');

  ui.myTicketsPopupList.innerHTML = cards;
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
  const activeRaffles = getActiveRaffles();

  if (!activeRaffles.length) {
    state.hasPickedRaffle = false;
    closeFullscreenPicker();
    return;
  }

  if (activeRaffles.length === 1) {
    state.selectedRaffleId = activeRaffles[0].id;
    state.hasPickedRaffle = true;
    closeFullscreenPicker();
    return;
  }

  if (!activeRaffles.some((item) => item.id === state.selectedRaffleId)) {
    state.selectedRaffleId = activeRaffles[0].id;
    state.hasPickedRaffle = false;
  }

  if (!state.hasPickedRaffle) {
    openFullscreenPicker();
  } else {
    closeFullscreenPicker();
  }
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
  const catalogRef = doc(db, 'artifacts', appId, 'public', 'data', 'raffle', 'catalog');

  onSnapshot(catalogRef, async (snap) => {
    if (!snap.exists()) {
      await setDoc(catalogRef, { items: DEFAULT_RAFFLES });
      return;
    }

    const items = Array.isArray(snap.data().items) ? snap.data().items : DEFAULT_RAFFLES;
    state.raffles = items;

    if (!items.some((item) => item.id === state.selectedRaffleId)) {
      state.selectedRaffleId = items.find((item) => item.status === 'active')?.id || items[0].id;
    }

    handleActiveRaffleFlow();
    subscribeTickets();
    render();
  });
}

function subscribeTickets() {
  if (unsubTickets) {
    unsubTickets();
  }

  const product = getProduct();
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

  const selectedPrizeHits = getSelectedPrizeHits(product);

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
    for (const num of state.selectedNumbers) {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', `tickets_${product.id}`, num);
      const check = await getDoc(ticketRef);
      if (check.exists()) {
        showToast(`A cota ${num} ja foi comprada.`);
        ui.buyBtn.disabled = false;
        return;
      }
    }

    for (const num of state.selectedNumbers) {
      const payload = {
        number: num,
        buyerName: ui.name.value,
        buyerEmail: ui.email.value,
        buyerCpf: ui.cpf.value,
        status: 'awaiting_payment',
        raffleId: product.id,
        raffleTitle: product.prizeName || product.title,
        date: new Date().toISOString(),
        uid: state.user.uid,
        lgpdConsent: true
      };

      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `tickets_${product.id}`, num), payload);
      await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'purchases', `${product.id}_${num}`), payload);
    }

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_CONFIG.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            title: `Rifa - ${product.prizeName || product.title}`,
            quantity: 1,
            unit_price: state.selectedNumbers.length * Number(product.price),
            currency_id: 'BRL'
          }
        ],
        external_reference: `${product.id}|${state.selectedNumbers.join(',')}`,
        metadata: {
          raffleId: product.id,
          selectedNumbers: state.selectedNumbers.join(','),
          buyerUid: state.user.uid
        },
        payer: {
          name: ui.name.value,
          email: ui.email.value,
          identification: {
            type: 'CPF',
            number: ui.cpf.value.replace(/\D/g, '')
          }
        },
        payment_methods: {
          excluded_payment_types: [
            { id: 'ticket' },
            { id: 'debit_card' },
            { id: 'atm' }
          ],
          installments: 12
        },
        back_urls: {
          success: `${window.location.origin}${window.location.pathname}?status=approved`,
          failure: `${window.location.origin}${window.location.pathname}?status=failure`,
          pending: `${window.location.origin}${window.location.pathname}?status=pending`
        },
        auto_return: 'approved'
      })
    });

    const data = await response.json();

    if (selectedPrizeHits.length) {
      state.pendingPrizeClaims = selectedPrizeHits.map((item) => ({
        number: item.number,
        value: item.value,
        whatsappNumber: product.prizeWhatsapp || DEFAULT_PRIZE_WHATSAPP_NUMBER,
        name: ui.name.value.trim(),
        email: ui.email.value.trim(),
        cpf: ui.cpf.value.trim(),
        raffleTitle: product.prizeName || product.title
      }));
      persistPendingPrizeClaims();
      showToast('Compra criada. O popup de premio aparecera somente apos pagamento aprovado.');
    }

    state.selectedNumbers = [];
    render();
    showToast('Reserva criada com sucesso.');

    if (data.init_point) {
      window.location.href = data.init_point;
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao processar checkout.');
  } finally {
    ui.buyBtn.disabled = false;
  }
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
    ui.myTicketsPopup.classList.remove('hidden');
  });
  ui.closePrizeClaimBtn.addEventListener('click', closePrizeClaimModal);
  ui.prizeClaimModal.addEventListener('click', (event) => {
    if (event.target === ui.prizeClaimModal) {
      closePrizeClaimModal();
    }
  });
  ui.sendPrizeClaimBtn.addEventListener('click', onSendPrizeClaim);

  setupCookieConsent();
  startLiveFeed();
  consumePendingPrizeClaimsAfterApprovedPayment();
  ui.checkoutForm.addEventListener('submit', processCheckout);

  try {
    state.user = await ensureAuth();
    subscribeCatalog();
    subscribeMyTickets();
  } catch (error) {
    console.error(error);
    state.user = { uid: 'local_demo' };
    state.raffles = DEFAULT_RAFFLES;
    state.selectedRaffleId = DEFAULT_RAFFLES.find((item) => item.status === 'active')?.id || DEFAULT_RAFFLES[0].id;
    render();
    showToast('Falha de conexao com Firebase. Modo local ativo para visualizacao.');
  }
}

init();
