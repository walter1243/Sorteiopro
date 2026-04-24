import {
  db,
  appId,
  ensureAuth,
  collection,
  doc,
  deleteDoc,
  setDoc,
  onSnapshot
} from './firebase-config.js';
import {
  ADMIN_CREDENTIALS,
  DEFAULT_RAFFLES,
  showToast,
  statusLabel
} from './common.js';

const ui = {
  loginBox: document.getElementById('admin-login'),
  loginForm: document.getElementById('admin-login-form'),
  adminUsername: document.getElementById('admin-username'),
  adminPassword: document.getElementById('admin-password'),
  togglePassword: document.getElementById('toggle-password'),
  menuToggle: document.getElementById('menu-toggle'),
  menuPopup: document.getElementById('admin-menu-popup'),
  closeMenuPopupBtn: document.getElementById('close-menu-popup'),
  menuLinks: [...document.querySelectorAll('.admin-menu-link')],
  sections: {
    'section-config': document.getElementById('section-config'),
    'section-buyers': document.getElementById('section-buyers'),
    'section-site': document.getElementById('section-site')
  },
  panel: document.getElementById('admin-panel'),
  logoutBtn: document.getElementById('logout-btn'),
  raffleSelect: document.getElementById('raffle-select'),
  raffleForm: document.getElementById('raffle-form'),
  prizeName: document.getElementById('prize-name'),
  raffleTotalValue: document.getElementById('raffle-total-value'),
  quotaPrice: document.getElementById('quota-price'),
  prizeWhatsapp: document.getElementById('prize-whatsapp'),
  totalQuotas: document.getElementById('total-quotas'),
  prizedNumberInput: document.getElementById('prized-number-input'),
  prizedValueInput: document.getElementById('prized-value-input'),
  addPrizedNumberBtn: document.getElementById('add-prized-number'),
  prizedNumbersBody: document.getElementById('prized-numbers-body'),
  raffleStatus: document.getElementById('raffle-status'),
  prizeImageFile: document.getElementById('prize-image-file'),
  imagePasteZone: document.getElementById('image-paste-zone'),
  prizeImagePreview: document.getElementById('prize-image-preview'),
  imageSelectionHint: document.getElementById('image-selection-hint'),
  deleteRaffleBtn: document.getElementById('delete-raffle-btn'),
  createRaffleBtn: document.getElementById('create-raffle-btn'),
  drawBtn: document.getElementById('draw-btn'),
  buyersRaffleSelect: document.getElementById('buyers-raffle-select'),
  quotaOverviewSummary: document.getElementById('quota-overview-summary'),
  quotaOverviewGrid: document.getElementById('quota-overview-grid'),
  buyersBody: document.getElementById('buyers-body'),
  salesHistoryBody: document.getElementById('sales-history-body'),
  winnerBox: document.getElementById('winner-box'),
  ticketDetailModal: document.getElementById('ticket-detail-modal'),
  closeTicketDetailBtn: document.getElementById('close-ticket-detail'),
  ticketDetailRaffle: document.getElementById('ticket-detail-raffle'),
  ticketDetailNumber: document.getElementById('ticket-detail-number'),
  ticketDetailName: document.getElementById('ticket-detail-name'),
  ticketDetailEmail: document.getElementById('ticket-detail-email'),
  ticketDetailStatus: document.getElementById('ticket-detail-status'),
  ticketDetailDate: document.getElementById('ticket-detail-date'),
  siteConfigForm: document.getElementById('site-config-form'),
  siteWhatsapp: document.getElementById('site-whatsapp'),
  // Draw section
  drawRaffleInfo: document.getElementById('draw-raffle-info'),
  drawRaffleImg: document.getElementById('draw-raffle-img'),
  drawRaffleName: document.getElementById('draw-raffle-name'),
  drawRafflePct: document.getElementById('draw-raffle-pct'),
  drawProgressFill: document.getElementById('draw-progress-fill'),
  drawChangeRaffleBtn: document.getElementById('draw-change-raffle-btn'),
  drawCardDisplay: document.getElementById('draw-card-display'),
  drawScreen: document.getElementById('draw-screen'),
  drawSpinningNumber: document.getElementById('draw-spinning-number'),
  drawRangeBadge: document.getElementById('draw-range-badge'),
  drawStatusDot: document.getElementById('draw-status-dot'),
  drawStatusLabel: document.getElementById('draw-status-label'),
  drawWinnerPanel: document.getElementById('draw-winner-panel'),
  drawWinnerLabel: document.getElementById('draw-winner-label'),
  drawWinnerNameText: document.getElementById('draw-winner-name-text'),
  drawWinnerNumberText: document.getElementById('draw-winner-number-text'),
  drawWhatsappBtn: document.getElementById('draw-whatsapp-btn'),
  adminQuickDrawBtn: document.getElementById('admin-quick-draw-btn'),
  drawResetBtn: document.getElementById('draw-reset-btn'),
  drawHistoryBox: document.getElementById('draw-history-box'),
  drawHistoryList: document.getElementById('draw-history-list'),
  drawHistoryToggleBtn: document.getElementById('draw-history-toggle-btn'),
  drawSettingsToggleBtn: document.getElementById('draw-settings-toggle-btn'),
  drawSettingsBox: document.getElementById('draw-settings-box'),
  drawClearHistoryBtn: document.getElementById('draw-clear-history-btn'),
  // Draw prize modal
  drawPrizeModal: document.getElementById('draw-prize-modal'),
  drawPrizeCancelBtn: document.getElementById('draw-prize-cancel-btn'),
  drawPrizeValue: document.getElementById('draw-prize-value'),
  drawPrizeConfirmBtn: document.getElementById('draw-prize-confirm-btn'),
  // Draw raffle modal
  drawRaffleModal: document.getElementById('draw-raffle-modal'),
  drawRaffleModalClose: document.getElementById('draw-raffle-modal-close'),
  drawModalImg: document.getElementById('draw-modal-img'),
  drawModalRaffleList: document.getElementById('draw-modal-raffle-list'),
  drawRaffleModalConfirm: document.getElementById('draw-raffle-modal-confirm')
};

const state = {
  user: null,
  authed: false,
  raffles: DEFAULT_RAFFLES,
  selectedRaffleId: DEFAULT_RAFFLES[0].id,
  soldTickets: {},
  allSoldEntries: [],
  prizeNumbersDraft: [],
  autoDrawing: false,
  tempImageUrl: '',
  drawRaffleId: null,       // raffle selected in draw section
  drawHistory: [],          // [{number, prizeValue, buyerName, buyerWhatsapp, date}]
  drawSpinTimer: null,
  drawModalRaffleId: null,  // raffle id being chosen in modal
  quotaRenderToken: 0,
  quotaOverviewItems: [],
  quotaOverviewRenderedCount: 0,
  quotaOverviewBatchSize: 0,
  quotaOverviewSoldCount: 0,
  quotaOverviewAvailableCount: 0,
  quotaOverviewTotalCount: 0,
  currentQuotaTickets: new Map(),
  raffleOptionsMarkup: ''
};

let unsubTickets = null;
let soldTicketsRefreshTimer = null;
let allTicketsUnsubs = [];
const ADMIN_INITIAL_VISIBLE_QUOTAS = 180;
const ADMIN_QUOTA_LOAD_BATCH = 140;
const ADMIN_QUOTA_SCROLL_THRESHOLD_PX = 140;

function currentRaffle() {
  return state.raffles.find((r) => r.id === state.selectedRaffleId) || state.raffles[0];
}

function buildRaffleOptionsMarkup() {
  return state.raffles
    .map((item) => `<option value="${item.id}">${item.prizeName || item.title} (${statusLabel(item.status)})</option>`)
    .join('');
}

function syncRaffleSelectors() {
  const markup = buildRaffleOptionsMarkup();
  if (markup !== state.raffleOptionsMarkup) {
    state.raffleOptionsMarkup = markup;
    ui.raffleSelect.innerHTML = markup;
    ui.buyersRaffleSelect.innerHTML = markup;
  }

  const raffle = currentRaffle();
  const value = raffle?.id || '';
  if (ui.raffleSelect.value !== value) {
    ui.raffleSelect.value = value;
  }
  if (ui.buyersRaffleSelect.value !== value) {
    ui.buyersRaffleSelect.value = value;
  }
}

function openQuotaDetailFromEvent(event) {
  const button = event.target.closest('.quota-chip-button');
  if (!button) {
    return;
  }

  const number = button.dataset.number || '';
  const ticket = state.currentQuotaTickets.get(number);
  if (ticket) {
    openTicketDetail(ticket);
  }
}

function isMobileInteraction() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

function formatDetailDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('pt-BR');
}

function openTicketDetail(ticket) {
  const raffle = currentRaffle();
  ui.ticketDetailRaffle.textContent = ticket.raffleTitle || raffle?.prizeName || raffle?.title || '-';
  ui.ticketDetailNumber.textContent = ticket.number || '-';
  ui.ticketDetailName.textContent = ticket.buyerName || '-';
  ui.ticketDetailEmail.textContent = ticket.buyerEmail || '-';
  ui.ticketDetailStatus.textContent = ticket.status || '-';
  ui.ticketDetailDate.textContent = formatDetailDate(ticket.date);
  ui.ticketDetailModal.classList.remove('hidden');
}

function closeTicketDetail() {
  ui.ticketDetailModal.classList.add('hidden');
}

function renderForm() {
  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  syncRaffleSelectors();
  ui.prizeName.value = raffle.prizeName || raffle.title;
  ui.raffleTotalValue.value = raffle.totalValue || Number(raffle.price || 0) * Number(raffle.totalQuotas || 0);
  ui.quotaPrice.value = raffle.price;
  ui.prizeWhatsapp.value = raffle.prizeWhatsapp || '';
  ui.totalQuotas.value = raffle.totalQuotas;
  ui.raffleStatus.value = raffle.status;
  state.prizeNumbersDraft = Array.isArray(raffle.prizeNumbers)
    ? raffle.prizeNumbers
        .map((item) => ({
          number: String(item.number || '').padStart(3, '0').slice(-3),
          value: Number(item.value || 0)
        }))
        .filter((item) => item.number && item.value > 0)
        .sort((a, b) => Number(a.number) - Number(b.number))
    : [];
  renderPrizedNumbersDraft();
  ui.prizeImagePreview.src = raffle.imageUrl || '';
  ui.prizeImagePreview.classList.toggle('hidden', !raffle.imageUrl);
  ui.prizeImagePreview.alt = `Imagem da rifa ${raffle.prizeName || raffle.title}`;
  ui.imageSelectionHint.textContent = raffle.imageUrl
    ? `Imagem atual vinculada a ${raffle.prizeName || raffle.title}.`
    : `Nenhuma imagem salva para ${raffle.prizeName || raffle.title}.`;
  ui.prizeImageFile.value = '';
  state.tempImageUrl = raffle.imageUrl || '';
}

function renderPrizedNumbersDraft() {
  if (!state.prizeNumbersDraft.length) {
    ui.prizedNumbersBody.innerHTML = '<tr><td colspan="3">Nenhum numero premiado cadastrado.</td></tr>';
    return;
  }

  ui.prizedNumbersBody.innerHTML = state.prizeNumbersDraft
    .map(
      (item) => `
        <tr>
          <td>${item.number}</td>
          <td>R$ ${item.value.toFixed(2).replace('.', ',')}</td>
          <td><button type="button" class="ghost prized-remove-btn" data-number="${item.number}">Remover</button></td>
        </tr>
      `
    )
    .join('');

  [...ui.prizedNumbersBody.querySelectorAll('.prized-remove-btn')].forEach((button) => {
    button.addEventListener('click', () => {
      state.prizeNumbersDraft = state.prizeNumbersDraft.filter((item) => item.number !== button.dataset.number);
      renderPrizedNumbersDraft();
    });
  });
}

function normalizePrizeNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits.length) {
    return '';
  }

  return digits.slice(-3).padStart(3, '0');
}

function addPrizedNumber() {
  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  const number = normalizePrizeNumber(ui.prizedNumberInput.value);
  const value = Number(ui.prizedValueInput.value || 0);
  const maxQuotaNumber = Math.max(Number(ui.totalQuotas.value || raffle.totalQuotas || 1) - 1, 0);

  if (!number) {
    showToast('Informe o numero da cota premiada.');
    return;
  }

  if (Number(number) > maxQuotaNumber) {
    showToast(`Numero fora da faixa da rifa. Maximo permitido: ${String(maxQuotaNumber).padStart(3, '0')}.`);
    return;
  }

  if (!Number.isFinite(value) || value <= 0) {
    showToast('Informe um valor de premio maior que zero.');
    return;
  }

  const existingIndex = state.prizeNumbersDraft.findIndex((item) => item.number === number);
  if (existingIndex >= 0) {
    state.prizeNumbersDraft[existingIndex] = { number, value };
  } else {
    state.prizeNumbersDraft.push({ number, value });
  }

  state.prizeNumbersDraft.sort((a, b) => Number(a.number) - Number(b.number));
  ui.prizedNumberInput.value = '';
  ui.prizedValueInput.value = '';
  renderPrizedNumbersDraft();
}

function renderBuyers() {
  const raffle = currentRaffle();
  const list = Object.entries(state.soldTickets)
    .map(([number, data]) => ({ number, ...data }))
    .sort((a, b) => Number(a.number) - Number(b.number));

  syncRaffleSelectors();

  if (!list.length) {
    ui.buyersBody.innerHTML = '<tr><td colspan="4">Nenhuma cota comprada ainda.</td></tr>';
  } else {
    ui.buyersBody.innerHTML = list
      .map((row) => `
        <tr>
          <td><button type="button" class="number-detail-trigger" data-table="buyers" data-number="${row.number}">${row.number}</button></td>
          <td>${row.buyerName ? `<button type="button" class="buyer-detail-trigger" data-table="buyers" data-number="${row.number}">${row.buyerName}</button>` : '-'}</td>
          <td>${row.buyerEmail || '-'}</td>
          <td>${row.status || '-'}</td>
        </tr>
      `)
      .join('');
  }

  renderQuotaOverview(raffle, list);
  bindBuyerDetailTriggers(ui.buyersBody, list, 'buyers');
  renderSalesHistory();

  if (raffle?.winner) {
    ui.winnerBox.textContent = `Ultimo ganhador: ${raffle.winner.buyerName} | Numero ${raffle.winner.number} | ${raffle.winner.buyerEmail}`;
  } else {
    ui.winnerBox.textContent = 'Sem resultado de sorteio para esta rifa.';
  }
}

function renderQuotaOverview(raffle, soldList) {
  if (!raffle) {
    ui.quotaOverviewSummary.textContent = '';
    ui.quotaOverviewGrid.innerHTML = '';
    state.quotaOverviewItems = [];
    state.quotaOverviewRenderedCount = 0;
    state.quotaOverviewTotalCount = 0;
    return;
  }

  const soldNumbers = new Set(soldList.map((item) => item.number));
  const soldByNumber = new Map(
    soldList.map((item) => [item.number, item])
  );
  state.currentQuotaTickets = soldByNumber;
  const totalQuotas = Number(raffle.totalQuotas || 0);
  const availableCount = Math.max(totalQuotas - soldList.length, 0);

  const isMobile = window.matchMedia('(max-width: 760px)').matches || isMobileInteraction();
  const batchSize = isMobile ? ADMIN_QUOTA_LOAD_BATCH : ADMIN_QUOTA_LOAD_BATCH * 2;
  const initialVisible = isMobile ? ADMIN_INITIAL_VISIBLE_QUOTAS : ADMIN_INITIAL_VISIBLE_QUOTAS * 2;

  state.quotaOverviewItems = [];
  state.quotaOverviewRenderedCount = 0;
  state.quotaOverviewBatchSize = batchSize;
  state.quotaOverviewSoldCount = soldList.length;
  state.quotaOverviewAvailableCount = availableCount;
  state.quotaOverviewTotalCount = totalQuotas;
  state.quotaRenderToken += 1;

  for (let cursor = 0; cursor < totalQuotas; cursor += 1) {
    const number = String(cursor).padStart(3, '0');
    const soldEntry = soldByNumber.get(number);
    const status = String(soldEntry?.status || '').toLowerCase();

    state.quotaOverviewItems.push({
      number,
      soldEntry,
      isSold: soldNumbers.has(number),
      isWinner: raffle.winner?.number === number,
      isClientSelected: ['awaiting_payment', 'pending', 'approved', 'paid', 'confirmed'].includes(status)
    });
  }

  ui.quotaOverviewGrid.innerHTML = '';
  ui.quotaOverviewGrid.scrollTop = 0;
  renderQuotaOverviewChunk(initialVisible);
}

function renderQuotaOverviewSummary() {
  const soldCount = state.quotaOverviewSoldCount;
  const availableCount = state.quotaOverviewAvailableCount;
  const totalCount = state.quotaOverviewTotalCount;
  const renderedCount = state.quotaOverviewRenderedCount;

  ui.quotaOverviewSummary.textContent = `${soldCount} compradas | ${availableCount} disponiveis | exibindo ${renderedCount} de ${totalCount}`;
}

function renderQuotaOverviewChunk(chunkSize) {
  if (!state.quotaOverviewItems.length) {
    renderQuotaOverviewSummary();
    return;
  }

  const token = state.quotaRenderToken;
  const start = state.quotaOverviewRenderedCount;
  const end = Math.min(start + chunkSize, state.quotaOverviewItems.length);

  if (start >= end) {
    renderQuotaOverviewSummary();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let index = start; index < end; index += 1) {
    const item = state.quotaOverviewItems[index];
    const firstName = item.soldEntry?.buyerName ? item.soldEntry.buyerName.trim().split(/\s+/)[0] : '';

    let chip;
    if (item.soldEntry) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quota-chip quota-chip-button';
      chip.dataset.number = item.number;
      chip.setAttribute('aria-label', `Cota ${item.number} de ${firstName || 'comprador'}`);
    } else {
      chip = document.createElement('span');
      chip.className = 'quota-chip';
    }

    if (item.isSold) chip.classList.add('sold');
    if (item.isClientSelected) chip.classList.add('client-selected');
    if (item.isWinner) chip.classList.add('winner');

    const strong = document.createElement('strong');
    strong.textContent = item.number;
    chip.appendChild(strong);

    if (firstName) {
      const small = document.createElement('small');
      small.textContent = firstName;
      chip.appendChild(small);
    }

    fragment.appendChild(chip);
  }

  requestAnimationFrame(() => {
    if (token !== state.quotaRenderToken) {
      return;
    }

    ui.quotaOverviewGrid.appendChild(fragment);
    state.quotaOverviewRenderedCount = end;
    renderQuotaOverviewSummary();
  });
}

function onQuotaOverviewScroll() {
  if (!state.quotaOverviewItems.length) {
    return;
  }

  const hasMore = state.quotaOverviewRenderedCount < state.quotaOverviewItems.length;
  if (!hasMore) {
    return;
  }

  const container = ui.quotaOverviewGrid;
  const reachedLoadZone = container.scrollTop + container.clientHeight >= container.scrollHeight - ADMIN_QUOTA_SCROLL_THRESHOLD_PX;
  if (!reachedLoadZone) {
    return;
  }

  renderQuotaOverviewChunk(state.quotaOverviewBatchSize || ADMIN_QUOTA_LOAD_BATCH);
}

function renderBuyersLoadingState() {
  syncRaffleSelectors();
  ui.buyersBody.innerHTML = '<tr><td colspan="4">Carregando cotas desta rifa...</td></tr>';
  ui.quotaOverviewSummary.textContent = 'Carregando cotas da rifa selecionada...';
  ui.quotaOverviewGrid.innerHTML = '';
  state.quotaOverviewItems = [];
  state.quotaOverviewRenderedCount = 0;
  state.quotaOverviewTotalCount = 0;
  state.quotaRenderToken += 1;
  state.currentQuotaTickets = new Map();
  ui.winnerBox.textContent = 'Carregando dados da rifa selecionada...';
}

function onRaffleSelectionChange(raffleId) {
  if (!raffleId) {
    return;
  }

  state.selectedRaffleId = raffleId;
  state.drawRaffleId = raffleId;
  state.soldTickets = {};
  renderForm();
  renderBuyersLoadingState();
  renderDrawRaffleInfo();
  subscribeTickets();
}

function renderSalesHistory() {
  const entries = [...state.allSoldEntries].sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime();
    const dateB = new Date(b.date || 0).getTime();
    return dateB - dateA;
  });

  if (!entries.length) {
    ui.salesHistoryBody.innerHTML = '<tr><td colspan="5">Nenhuma cota vendida em nenhuma rifa ainda.</td></tr>';
    return;
  }

  ui.salesHistoryBody.innerHTML = entries
    .map((entry) => `
      <tr>
        <td>${entry.raffleTitle || '-'}</td>
        <td>${entry.number ? `<button type="button" class="number-detail-trigger" data-table="history" data-raffle-id="${entry.raffleId || ''}" data-number="${entry.number}">${entry.number}</button>` : '-'}</td>
        <td>${entry.buyerName ? `<button type="button" class="buyer-detail-trigger" data-table="history" data-raffle-id="${entry.raffleId || ''}" data-number="${entry.number || ''}">${entry.buyerName}</button>` : '-'}</td>
        <td>${entry.buyerEmail || '-'}</td>
        <td>${entry.status || '-'}</td>
      </tr>
    `)
    .join('');

  bindBuyerDetailTriggers(ui.salesHistoryBody, entries, 'history');
}

function bindBuyerDetailTriggers(container, entries, source) {
  const entryMap = new Map(
    entries.map((entry) => {
      const key = source === 'history'
        ? `${entry.raffleId || ''}:${entry.number || ''}`
        : entry.number || '';
      return [key, entry];
    })
  );

  [...container.querySelectorAll('.buyer-detail-trigger, .number-detail-trigger')].forEach((button) => {
    button.addEventListener('click', () => {
      const key = source === 'history'
        ? `${button.dataset.raffleId || ''}:${button.dataset.number || ''}`
        : button.dataset.number || '';
      const ticket = entryMap.get(key);
      if (ticket) {
        openTicketDetail(ticket);
      }
    });
  });
}

function recalcQuotaPrice() {
  const total = Number(ui.raffleTotalValue.value || 0);
  const quotas = Number(ui.totalQuotas.value || 0);
  const quotaPrice = quotas > 0 ? total / quotas : 0;
  ui.quotaPrice.value = quotaPrice.toFixed(2);
}

function setImageDataUrl(url) {
  const raffle = currentRaffle();
  state.tempImageUrl = url;
  ui.prizeImagePreview.src = url;
  ui.prizeImagePreview.classList.remove('hidden');
  ui.prizeImagePreview.alt = `Imagem da rifa ${raffle?.prizeName || raffle?.title || 'selecionada'}`;
  ui.imageSelectionHint.textContent = `Salvando imagem de ${raffle?.prizeName || raffle?.title || 'esta rifa'}...`;

  if (!raffle) {
    return;
  }

  const updated = state.raffles.map((item) =>
    item.id === raffle.id
      ? {
          ...item,
          imageUrl: url
        }
      : item
  );

  persistCatalog(updated)
    .then(() => {
      state.raffles = updated;
      ui.imageSelectionHint.textContent = `Imagem atual vinculada a ${raffle.prizeName || raffle.title}.`;
      showToast('Imagem salva no catalogo.');
    })
    .catch((error) => {
      console.error(error);
      ui.imageSelectionHint.textContent = 'Falha ao salvar imagem no servidor.';
      showToast(error?.message || 'Falha ao salvar imagem.');
    });
}

function handlePastedImage(event) {
  const items = event.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) {
        continue;
      }

      compressImage(file, (compressedBase64) => {
        setImageDataUrl(compressedBase64);
        showToast('Imagem colada e comprimida.');
      });
      break;
    }
  }
}


function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Redimensiona para max 360px mantendo proporção
      const maxWidth = 360;
      let { width, height } = img;
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Comprime para JPEG 45% para reduzir payload da API em mobile
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.45);
      callback(compressedBase64);
    };
    img.src = String(event.target?.result || '');
  };
  reader.readAsDataURL(file);
}

function handleImageFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  compressImage(file, (compressedBase64) => {
    setImageDataUrl(compressedBase64);
    showToast('Imagem selecionada e comprimida.');
  });
}
function openPanel() {
  ui.loginBox.classList.add('hidden');
  ui.panel.classList.remove('hidden');
}

function closePanel() {
  ui.loginBox.classList.remove('hidden');
  ui.panel.classList.add('hidden');
  ui.menuPopup.classList.add('hidden');
}

function toggleMenuPopup() {
  ui.menuPopup.classList.toggle('hidden');
}

function closeMenuPopup() {
  ui.menuPopup.classList.add('hidden');
}

function showAdminSection(sectionId) {
  Object.entries(ui.sections).forEach(([id, el]) => {
    const isTarget = id === sectionId;
    el.classList.toggle('hidden', !isTarget);

    if (isTarget) {
      el.classList.remove('admin-section');
      void el.offsetWidth;
      el.classList.add('admin-section');
    }
  });

  ui.menuLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.target === sectionId);
  });
}

function subscribeSiteConfig() {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'siteConfig', 'main');
  onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      ui.siteWhatsapp.value = snap.data().whatsapp || '';
    }
  });
}

async function onSaveSiteConfig(event) {
  event.preventDefault();
  const whatsapp = ui.siteWhatsapp.value.replace(/\D/g, '');
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'siteConfig', 'main');
  await setDoc(ref, { whatsapp });
  showToast('Configurações do site salvas.');
}

async function persistCatalog(updated) {
  const response = await fetch('/api/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: updated })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Falha ao salvar catalogo no servidor');
  }

  state.raffles = updated;
}

async function subscribeCatalog() {
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Falha ao carregar catalogo');
    }

    const payload = await response.json();
    const items = Array.isArray(payload.items) && payload.items.length ? payload.items : DEFAULT_RAFFLES;
    state.raffles = items;
    state.raffleOptionsMarkup = '';

    if (!state.raffles.some((r) => r.id === state.selectedRaffleId)) {
      state.selectedRaffleId = state.raffles[0].id;
    }

    if (!state.raffles.some((r) => r.id === state.drawRaffleId)) {
      state.drawRaffleId = state.selectedRaffleId;
    }

    renderForm();
    subscribeAllTickets();
    subscribeTickets();
    renderDrawRaffleInfo();
  } catch (error) {
    console.error(error);
    state.raffles = DEFAULT_RAFFLES;
    state.raffleOptionsMarkup = '';
    state.selectedRaffleId = DEFAULT_RAFFLES[0].id;
    state.drawRaffleId = state.selectedRaffleId;
    renderForm();
    subscribeAllTickets();
    subscribeTickets();
    showToast('Falha ao carregar catalogo remoto. Exibindo catalogo padrao.');
  }
}

function subscribeAllTickets() {
  allTicketsUnsubs.forEach((unsubscribe) => unsubscribe());
  allTicketsUnsubs = [];

  if (!state.raffles.length) {
    state.allSoldEntries = [];
    renderSalesHistory();
    return;
  }

  const aggregate = new Map();

  state.raffles.forEach((raffle) => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', `tickets_${raffle.id}`);
    const unsubscribe = onSnapshot(ref, (snap) => {
      for (const key of [...aggregate.keys()]) {
        if (key.startsWith(`${raffle.id}:`)) {
          aggregate.delete(key);
        }
      }

      snap.forEach((ticketDoc) => {
        aggregate.set(`${raffle.id}:${ticketDoc.id}`, {
          ...ticketDoc.data(),
          number: ticketDoc.id,
          raffleId: raffle.id,
          raffleTitle: raffle.prizeName || raffle.title
        });
      });

      state.allSoldEntries = [...aggregate.values()];
      renderSalesHistory();
    });

    allTicketsUnsubs.push(unsubscribe);
  });
}

// Busca cotas do Neon (fonte autoritativa: pagamentos via webhook)
async function fetchSoldTicketsFromNeon(raffleId) {
  try {
    const response = await fetch(`/api/raffle-tickets?raffleId=${encodeURIComponent(raffleId)}`, {
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Falha ao carregar cotas do servidor.');
    }
    return data?.tickets && typeof data.tickets === 'object' ? data.tickets : {};
  } catch (error) {
    console.error('[fetchSoldTicketsFromNeon] Error:', error);
    return null;
  }
}

// Mescla tickets do Firebase (tempo real) com tickets do Neon (webhook/servidor)
// Neon vence em caso de conflito pois é a fonte autoritativa
function mergeTicketSources(firebaseTickets, neonTickets) {
  return Object.assign({}, firebaseTickets, neonTickets);
}

function subscribeTickets() {
  if (unsubTickets) {
    unsubTickets();
    unsubTickets = null;
  }
  if (soldTicketsRefreshTimer) {
    clearInterval(soldTicketsRefreshTimer);
    soldTicketsRefreshTimer = null;
  }

  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  renderBuyersLoadingState();

  let firebaseTickets = {};

  // Firebase: atualizações em tempo real (clientes que confirmaram pelo site)
  const ref = collection(db, 'artifacts', appId, 'public', 'data', `tickets_${raffle.id}`);
  unsubTickets = onSnapshot(ref, async (snap) => {
    const fb = {};
    snap.forEach((d) => {
      const data = d.data();
      const status = String(data.status || '').toLowerCase();
      // Filtra apenas cotas efetivamente compradas
      if (status === 'approved' || status === 'paid') {
        fb[d.id] = data;
      }
    });
    firebaseTickets = fb;

    // Mescla com última versão do Neon para garantir consistência
    const neonTickets = await fetchSoldTicketsFromNeon(raffle.id);
    state.soldTickets = neonTickets !== null
      ? mergeTicketSources(firebaseTickets, neonTickets)
      : firebaseTickets;

    renderBuyers();
    maybeAutoDrawIfComplete();
  });

  // Neon: sincronização periódica (pagamentos aprovados via webhook)
  soldTicketsRefreshTimer = setInterval(async () => {
    const neonTickets = await fetchSoldTicketsFromNeon(raffle.id);
    if (neonTickets !== null) {
      state.soldTickets = mergeTicketSources(firebaseTickets, neonTickets);
      renderBuyers();
      maybeAutoDrawIfComplete();
    }
  }, 15000);
}

async function onAdminLogin(event) {
  event.preventDefault();

  const username = ui.adminUsername.value.trim().toLowerCase();
  const password = ui.adminPassword.value;
  const allowedUsers = [ADMIN_CREDENTIALS.username.toLowerCase(), 'admin'];

  if (!allowedUsers.includes(username) || password !== ADMIN_CREDENTIALS.password) {
    showToast('Credenciais de administrador invalidas.');
    return;
  }

  state.authed = true;
  openPanel();
  showToast('Login administrativo realizado.');
}

async function onSaveRaffle(event) {
  event.preventDefault();
  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  const desiredStatus = ui.raffleStatus.value;
  const totalValue = Number(ui.raffleTotalValue.value || 0);
  const totalQuotas = Number(ui.totalQuotas.value || 1);
  const quotaPrice = totalQuotas > 0 ? totalValue / totalQuotas : 0;
  const prizeWhatsapp = ui.prizeWhatsapp.value.trim();
  const maxQuotaNumber = Math.max(totalQuotas - 1, 0);
  const sanitizedPrizeNumbers = state.prizeNumbersDraft
    .filter((item) => Number(item.number) <= maxQuotaNumber)
    .map((item) => ({ number: item.number, value: Number(item.value) }));

  const updated = state.raffles.map((item) => {
    if (item.id === raffle.id) {
      return {
        ...item,
        prizeName: ui.prizeName.value,
        title: ui.prizeName.value,
        totalValue,
        price: Number(quotaPrice.toFixed(2)),
        totalQuotas,
        prizeNumbers: sanitizedPrizeNumbers,
        prizeWhatsapp,
        imageUrl: state.tempImageUrl || item.imageUrl || '',
        status: desiredStatus
      };
    }

    return item;
  });

  try {
    await persistCatalog(updated);
    recalcQuotaPrice();
    showToast('Configuracoes salvas.');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Falha ao salvar configuracoes da rifa.');
  }
}

async function onCreateRaffle() {
  const id = `rifa_${Date.now()}`;
  const raffle = {
    ...DEFAULT_RAFFLES[0],
    id,
    title: 'Nova rifa',
    prizeName: 'Nova rifa',
    totalValue: 3000,
    price: 10,
    totalQuotas: 300,
    prizeNumbers: [],
    prizeWhatsapp: '',
    imageUrl: '',
    status: 'paused',
    winner: null
  };

  const updated = [...state.raffles, raffle];
  await persistCatalog(updated);
  state.selectedRaffleId = id;
  state.drawRaffleId = id;
  renderForm();
  subscribeTickets();
  renderDrawRaffleInfo();
  showToast('Nova rifa criada.');
}

async function onDeleteRaffle() {
  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  if (state.raffles.length <= 1) {
    showToast('Mantenha ao menos uma rifa no catalogo.');
    return;
  }

  // Bloqueia exclusão se há cotas vendidas (proteção anti-fraude)
  const soldCount = Object.keys(state.soldTickets).length;
  if (soldCount > 0) {
    showToast(`Nao e possivel apagar "${raffle.prizeName || raffle.title}" pois ja possui ${soldCount} cota(s) vendida(s). Apenas rifas sem vendas podem ser apagadas.`);
    return;
  }

  const confirmed = window.confirm(`Deseja apagar a rifa "${raffle.prizeName || raffle.title}"?`);
  if (!confirmed) {
    return;
  }

  const typed = window.prompt('Digite APAGAR para confirmar a exclusao desta rifa.');
  if (typed !== 'APAGAR') {
    showToast('Exclusao cancelada. Confirmacao invalida.');
    return;
  }

  const response = await fetch(`/api/catalog?id=${encodeURIComponent(raffle.id)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Falha ao apagar rifa no servidor');
  }

  state.raffles = state.raffles.filter((item) => item.id !== raffle.id);
  state.selectedRaffleId = state.raffles[0]?.id || DEFAULT_RAFFLES[0].id;
  state.drawRaffleId = state.selectedRaffleId;
  renderForm();
  subscribeAllTickets();
  subscribeTickets();
  renderDrawRaffleInfo();
  showToast('Rifa apagada com sucesso.');
}

async function onDraw() {
  const raffle = currentRaffle();
  const totalQuotas = Number(raffle?.totalQuotas || 0);
  const soldCount = Object.keys(state.soldTickets).length;

  if (totalQuotas <= 0 || soldCount < totalQuotas) {
    showToast('Sorteio liberado somente com 100% das cotas vendidas.');
    return;
  }

  let entries = Object.entries(state.soldTickets).map(([number, data]) => ({ number, ...data }));

  if (!entries.length) {
    showToast('Nao ha compradores para sortear.');
    return;
  }

  const index = Math.floor(Math.random() * entries.length);
  const winner = entries[index];

  const updated = state.raffles.map((item) =>
    item.id === raffle.id
      ? {
          ...item,
          status: 'active',
          winner: {
            number: winner.number,
            buyerName: winner.buyerName || 'Sem nome',
            buyerEmail: winner.buyerEmail || 'Sem email',
            date: new Date().toISOString()
          }
        }
      : item
  );

  const deletions = Object.keys(state.soldTickets).map((ticketNumber) =>
    deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `tickets_${raffle.id}`, ticketNumber))
  );
  await Promise.all(deletions);

  await persistCatalog(updated);
  showToast(`Sorteio finalizado. Vencedor: ${winner.buyerName || 'Sem nome'}. Rifa zerada.`);
}

async function maybeAutoDrawIfComplete() {
  const raffle = currentRaffle();
  if (!raffle || raffle.winner || state.autoDrawing) {
    return;
  }

  const totalQuotas = Number(raffle.totalQuotas || 0);
  const soldCount = Object.keys(state.soldTickets).length;
  if (totalQuotas <= 0 || soldCount < totalQuotas) {
    return;
  }

  state.autoDrawing = true;
  try {
    await onDraw();
  } finally {
    state.autoDrawing = false;
  }
}

// ==================== DRAW SECTION ====================

function getDrawRaffle() {
  return state.raffles.find((r) => r.id === state.drawRaffleId) || state.raffles.find((r) => r.status === 'active') || state.raffles[0];
}

function renderDrawRaffleInfo() {
  const raffle = getDrawRaffle();
  if (!raffle) {
    ui.drawRaffleName.textContent = 'Nenhuma rifa disponível';
    ui.drawRafflePct.textContent = 'Progresso: 0%';
    ui.drawProgressFill.style.width = '0%';
    ui.drawRaffleImg.classList.add('hidden');
    if (ui.drawRangeBadge) ui.drawRangeBadge.textContent = 'Números de: 0 — 0';
    return;
  }

  state.drawRaffleId = raffle.id;

  ui.drawRaffleName.textContent = raffle.prizeName || raffle.title || 'Rifa';
  ui.drawRaffleImg.classList.toggle('hidden', !raffle.imageUrl);
  if (raffle.imageUrl) {
    ui.drawRaffleImg.src = raffle.imageUrl;
  }

  const totalQuotas = Number(raffle.totalQuotas || 0);
  const usedSold = raffle.id === state.drawRaffleId ? Object.keys(state.soldTickets).length : 0;
  const pct = totalQuotas > 0 ? Math.min((usedSold / totalQuotas) * 100, 100) : 0;
  ui.drawRafflePct.textContent = `Progresso: ${pct.toFixed(1).replace('.', ',')}%`;
  ui.drawProgressFill.style.width = `${pct}%`;

  if (ui.drawRangeBadge) {
    const max = Math.max(totalQuotas - 1, 0);
    ui.drawRangeBadge.textContent = `Números de: 0 — ${max}`;
  }
}

function openDrawPrizeModal() {
  ui.drawPrizeValue.value = '';
  ui.drawPrizeModal.classList.remove('hidden');
  ui.drawPrizeValue.focus();
}

function closeDrawPrizeModal() {
  ui.drawPrizeModal.classList.add('hidden');
}

function openDrawRaffleModal() {
  const all = state.raffles;
  const selected = all.find((r) => r.id === (state.drawRaffleId || state.selectedRaffleId)) || all[0];
  state.drawModalRaffleId = selected?.id || null;

  // Update image
  if (selected?.imageUrl) {
    ui.drawModalImg.src = selected.imageUrl;
    ui.drawModalImg.classList.remove('hidden');
  } else {
    ui.drawModalImg.classList.add('hidden');
  }

  // Render list
  ui.drawModalRaffleList.innerHTML = all
    .map((r) => {
      const activeClass = r.id === state.drawModalRaffleId ? 'active' : '';
      return `
        <button type="button" class="draw-modal-raffle-btn ${activeClass}" data-draw-modal-raffle-id="${r.id}">
          <strong>${r.prizeName || r.title}</strong>
          <span style="color:var(--muted);font-size:0.72rem;"> — ${statusLabel(r.status)} | R$ ${r.price?.toFixed(2).replace('.', ',')} por cota</span>
        </button>`;
    })
    .join('');

  [...ui.drawModalRaffleList.querySelectorAll('.draw-modal-raffle-btn')].forEach((btn) => {
    btn.addEventListener('click', () => {
      state.drawModalRaffleId = btn.dataset.drawModalRaffleId;
      const picked = state.raffles.find((r) => r.id === state.drawModalRaffleId);
      if (picked?.imageUrl) {
        ui.drawModalImg.src = picked.imageUrl;
        ui.drawModalImg.classList.remove('hidden');
      } else {
        ui.drawModalImg.classList.add('hidden');
      }
      [...ui.drawModalRaffleList.querySelectorAll('.draw-modal-raffle-btn')].forEach((b) => {
        b.classList.toggle('active', b.dataset.drawModalRaffleId === state.drawModalRaffleId);
      });
    });
  });

  ui.drawRaffleModal.classList.remove('hidden');
}

function closeDrawRaffleModal() {
  ui.drawRaffleModal.classList.add('hidden');
}

function confirmDrawRaffleModal() {
  if (state.drawModalRaffleId) {
    onRaffleSelectionChange(state.drawModalRaffleId);
  }
  closeDrawRaffleModal();
}

async function onAdminQuickDraw() {
  const raffle = getDrawRaffle();
  if (!raffle) {
    showToast('Nenhuma rifa disponível para sortear.');
    return;
  }

  const soldEntries = Object.entries(state.soldTickets);
  if (!soldEntries.length) {
    showToast('Nenhuma cota comprada nesta rifa para sortear.');
    return;
  }

  openDrawPrizeModal();
}

async function startQuickDraw(prizeValue) {
  const raffle = getDrawRaffle();
  if (!raffle) return;

  ui.adminQuickDrawBtn.disabled = true;
  ui.drawWinnerPanel.classList.add('hidden');
  ui.drawScreen.classList.remove('hidden');
  ui.drawSpinningNumber.classList.add('spinning');
  if (ui.drawStatusDot) { ui.drawStatusDot.classList.add('spinning'); }
  if (ui.drawStatusLabel) { ui.drawStatusLabel.textContent = 'Sorteando...'; }

  // Fixed rule: draw only from purchased numbers.
  const pool = Object.keys(state.soldTickets);

  if (!pool.length) {
    showToast('Nenhum número disponível para sorteio.');
    ui.adminQuickDrawBtn.disabled = false;
    ui.drawSpinningNumber.classList.remove('spinning');
    if (ui.drawStatusDot) { ui.drawStatusDot.classList.remove('spinning'); }
    if (ui.drawStatusLabel) { ui.drawStatusLabel.textContent = 'Sistema Online'; }
    return;
  }

  // Animation: cycle through random numbers for ~2.5s, decelerating
  const duration = 2500;
  const start = Date.now();

  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = Date.now() - start;
      const randomIdx = Math.floor(Math.random() * pool.length);
      ui.drawSpinningNumber.textContent = pool[randomIdx];

      if (elapsed < duration) {
        const interval = Math.min(40 + (elapsed / duration) * 160, 200);
        setTimeout(tick, interval);
      } else {
        resolve();
      }
    };
    tick();
  });

  // Final pick
  const finalIdx = Math.floor(Math.random() * pool.length);
  const winnerNumber = pool[finalIdx];
  ui.drawSpinningNumber.classList.remove('spinning');
  ui.drawSpinningNumber.textContent = winnerNumber;

  if (ui.drawStatusDot) { ui.drawStatusDot.classList.remove('spinning'); }
  if (ui.drawStatusLabel) { ui.drawStatusLabel.textContent = 'Sistema Online'; }

  // Get ticket info if this number was purchased
  const ticket = state.soldTickets[winnerNumber];

  // Show winner panel
  setTimeout(() => {
    ui.drawScreen.classList.add('hidden');
    ui.drawWinnerPanel.classList.remove('hidden');
    ui.drawWinnerLabel.textContent = `🏆 Ganhador! Cota ${winnerNumber}`;
    ui.drawWinnerNameText.textContent = ticket
      ? `${ticket.buyerName || 'Comprador'}${ticket.buyerEmail ? ` — ${ticket.buyerEmail}` : ''}`
      : 'Número não comprado';
    ui.drawWinnerNumberText.textContent = `Cota ${winnerNumber}`;

    const buyerPhone = ticket?.buyerWhatsapp || ticket?.buyerCpf || '';
    const prizeLabel = prizeValue > 0 ? `R$ ${Number(prizeValue).toFixed(2).replace('.', ',')}` : 'prêmio';

    if (ticket && buyerPhone) {
      const msg = `Parabéns, você ganhou ${prizeLabel}! Mande sua chave Pix para receber. 🎉`;
      const phone = String(buyerPhone).replace(/\D/g, '');
      const waUrl = `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent(msg)}`;
      ui.drawWhatsappBtn.classList.remove('hidden');
      ui.drawWhatsappBtn.onclick = () => window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      ui.drawWhatsappBtn.classList.add('hidden');
    }

    // Add to draw history
    state.drawHistory.unshift({
      number: winnerNumber,
      prizeValue,
      buyerName: ticket?.buyerName || (ticket ? 'Comprador' : null),
      date: new Date().toLocaleTimeString('pt-BR')
    });
    renderDrawHistory();

    // Save quick draw winner to raffle catalog so client can show gift icon
    const quickDrawWinners = Array.isArray(raffle.quickDrawWinners) ? [...raffle.quickDrawWinners] : [];
    const alreadyExists = quickDrawWinners.some((w) => w.number === winnerNumber);
    if (!alreadyExists) {
      quickDrawWinners.push({ number: winnerNumber, prizeValue, date: new Date().toISOString() });
      const updatedRaffles = state.raffles.map((r) =>
        r.id === raffle.id ? { ...r, quickDrawWinners } : r
      );
      persistCatalog(updatedRaffles).catch(console.error);
    }

    ui.adminQuickDrawBtn.disabled = false;
  }, 300);
}

function renderDrawHistory() {
  if (!state.drawHistory.length) {
    ui.drawHistoryList.innerHTML = '<p class="muted">Nenhum sorteio realizado nesta sessão.</p>';
    return;
  }

  ui.drawHistoryList.innerHTML = state.drawHistory
    .map((item) => `
      <div class="draw-history-item">
        <span class="draw-h-number">${item.number}</span>
        <span class="draw-h-prize">R$ ${Number(item.prizeValue || 0).toFixed(2).replace('.', ',')}</span>
        ${item.buyerName ? `<span class="draw-h-buyer">${item.buyerName}</span>` : '<span class="draw-h-buyer muted">Sem comprador</span>'}
        <span class="draw-h-time">${item.date}</span>
      </div>
    `)
    .join('');
}

function initDrawSection() {
  // Change raffle button
  ui.drawChangeRaffleBtn.addEventListener('click', openDrawRaffleModal);

  // Raffle modal
  ui.drawRaffleModalClose.addEventListener('click', closeDrawRaffleModal);
  ui.drawRaffleModalConfirm.addEventListener('click', confirmDrawRaffleModal);
  ui.drawRaffleModal.addEventListener('click', (e) => {
    if (e.target === ui.drawRaffleModal) closeDrawRaffleModal();
  });

  // Prize modal
  ui.drawPrizeCancelBtn.addEventListener('click', closeDrawPrizeModal);
  ui.drawPrizeModal.addEventListener('click', (e) => {
    if (e.target === ui.drawPrizeModal) closeDrawPrizeModal();
  });
  ui.drawPrizeConfirmBtn.addEventListener('click', () => {
    const val = parseFloat(ui.drawPrizeValue.value || '0');
    if (val < 0 || isNaN(val)) {
      showToast('Informe um valor válido para o prêmio.');
      return;
    }
    closeDrawPrizeModal();
    startQuickDraw(val).catch((err) => {
      console.error(err);
      showToast(err?.message || 'Erro ao sortear.');
      ui.adminQuickDrawBtn.disabled = false;
    });
  });

  // Main draw button
  ui.adminQuickDrawBtn.addEventListener('click', onAdminQuickDraw);

  renderDrawRaffleInfo();

  // Reset button — clear winner panel, reset display
  if (ui.drawResetBtn) {
    ui.drawResetBtn.addEventListener('click', () => {
      state.drawHistory = [];
      if (ui.drawScreen) ui.drawScreen.classList.remove('hidden');
      if (ui.drawWinnerPanel) ui.drawWinnerPanel.classList.add('hidden');
      if (ui.drawSpinningNumber) ui.drawSpinningNumber.textContent = '000';
      if (ui.drawStatusDot) ui.drawStatusDot.classList.remove('spinning');
      if (ui.drawStatusLabel) ui.drawStatusLabel.textContent = 'Sistema Online';
      renderDrawHistory();
    });
  }

  // History toggle
  if (ui.drawHistoryToggleBtn && ui.drawHistoryBox) {
    ui.drawHistoryToggleBtn.addEventListener('click', () => {
      ui.drawHistoryBox.classList.toggle('hidden');
    });
  }

  // Settings toggle
  if (ui.drawSettingsToggleBtn && ui.drawSettingsBox) {
    ui.drawSettingsToggleBtn.addEventListener('click', () => {
      ui.drawSettingsBox.classList.toggle('hidden');
    });
  }

  // Clear history button
  if (ui.drawClearHistoryBtn) {
    ui.drawClearHistoryBtn.addEventListener('click', () => {
      state.drawHistory = [];
      renderDrawHistory();
    });
  }

  renderDrawHistory();
}

// ==================== END DRAW SECTION ====================

async function init() {
  ui.loginForm.addEventListener('submit', onAdminLogin);
  ui.togglePassword.addEventListener('click', () => {
    const nextType = ui.adminPassword.type === 'password' ? 'text' : 'password';
    ui.adminPassword.type = nextType;
    ui.togglePassword.textContent = nextType === 'password' ? 'Ver senha' : 'Ocultar';
  });
  ui.menuToggle.addEventListener('click', toggleMenuPopup);
  ui.closeMenuPopupBtn.addEventListener('click', closeMenuPopup);
  ui.menuLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const sectionId = link.dataset.target || 'section-config';
      showAdminSection(sectionId);
      closeMenuPopup();
    });
  });

  document.addEventListener('click', (event) => {
    const clickedInsidePopup = ui.menuPopup.contains(event.target);
    const clickedToggle = ui.menuToggle.contains(event.target);
    if (!clickedInsidePopup && !clickedToggle) {
      closeMenuPopup();
    }
  });
  ui.logoutBtn.addEventListener('click', () => {
    state.authed = false;
    closePanel();
  });
  ui.closeTicketDetailBtn.addEventListener('click', closeTicketDetail);
  ui.ticketDetailModal.addEventListener('click', (event) => {
    if (event.target === ui.ticketDetailModal) {
      closeTicketDetail();
    }
  });

  ui.raffleSelect.addEventListener('change', (event) => {
    onRaffleSelectionChange(event.target.value);
  });
  ui.buyersRaffleSelect.addEventListener('change', (event) => {
    onRaffleSelectionChange(event.target.value);
  });

  ui.quotaOverviewGrid.addEventListener('click', (event) => {
    if (!isMobileInteraction()) {
      return;
    }
    openQuotaDetailFromEvent(event);
  });

  ui.quotaOverviewGrid.addEventListener('dblclick', (event) => {
    if (isMobileInteraction()) {
      return;
    }
    openQuotaDetailFromEvent(event);
  });

  ui.quotaOverviewGrid.addEventListener('scroll', onQuotaOverviewScroll, { passive: true });

  ui.raffleTotalValue.addEventListener('input', recalcQuotaPrice);
  ui.totalQuotas.addEventListener('input', recalcQuotaPrice);
  ui.addPrizedNumberBtn.addEventListener('click', addPrizedNumber);
  ui.imagePasteZone.addEventListener('paste', handlePastedImage);
  document.addEventListener('paste', (event) => {
    if (document.activeElement === ui.imagePasteZone) {
      return;
    }
    handlePastedImage(event);
  });
  ui.prizeImageFile.addEventListener('change', handleImageFileSelect);

  ui.raffleForm.addEventListener('submit', onSaveRaffle);
  ui.deleteRaffleBtn.addEventListener('click', async () => {
    try {
      await onDeleteRaffle();
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Falha ao apagar rifa.');
    }
  });
  ui.createRaffleBtn.addEventListener('click', onCreateRaffle);
  ui.drawBtn.addEventListener('click', onDraw);

  try {
    state.user = await ensureAuth();
    await subscribeCatalog();
    subscribeSiteConfig();
    showAdminSection('section-config');
    initDrawSection();
  } catch (error) {
    console.error(error);
    await subscribeCatalog();
    showToast('Falha de autenticacao. Catalogo remoto continua disponivel.');
    showAdminSection('section-config');
    initDrawSection();
  }

  ui.siteConfigForm.addEventListener('submit', onSaveSiteConfig);
}

closePanel();
init();
