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
  siteWhatsapp: document.getElementById('site-whatsapp')
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
  tempImageUrl: ''
};

let unsubTickets = null;
let allTicketsUnsubs = [];

function currentRaffle() {
  return state.raffles.find((r) => r.id === state.selectedRaffleId) || state.raffles[0];
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

  ui.raffleSelect.innerHTML = state.raffles
    .map((r) => `<option value="${r.id}">${r.prizeName || r.title} (${statusLabel(r.status)})</option>`)
    .join('');

  ui.raffleSelect.value = raffle.id;
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

  ui.buyersRaffleSelect.innerHTML = state.raffles
    .map((item) => `<option value="${item.id}">${item.prizeName || item.title} (${statusLabel(item.status)})</option>`)
    .join('');
  ui.buyersRaffleSelect.value = raffle?.id || '';

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
    return;
  }

  const soldNumbers = new Set(soldList.map((item) => item.number));
  const soldByNumber = new Map(
    soldList.map((item) => [item.number, item])
  );
  const totalQuotas = Number(raffle.totalQuotas || 0);
  const availableCount = Math.max(totalQuotas - soldList.length, 0);

  ui.quotaOverviewSummary.textContent = `${soldList.length} compradas | ${availableCount} disponiveis | ${totalQuotas} no total`;

  ui.quotaOverviewGrid.innerHTML = Array.from({ length: totalQuotas }, (_, index) => {
    const number = String(index).padStart(3, '0');
    const isSold = soldNumbers.has(number);
    const isWinner = raffle.winner?.number === number;
    const soldEntry = soldByNumber.get(number);
    const status = String(soldEntry?.status || '').toLowerCase();
    const isClientSelected = ['awaiting_payment', 'pending', 'approved', 'paid', 'confirmed'].includes(status);
    const firstName = soldEntry?.buyerName ? soldEntry.buyerName.trim().split(/\s+/)[0] : '';
    const classes = ['quota-chip'];

    if (isSold) {
      classes.push('sold');
    }

    if (isClientSelected) {
      classes.push('client-selected');
    }

    if (isWinner) {
      classes.push('winner');
    }

    if (!soldEntry) {
      return `
      <span class="${classes.join(' ')}">
        <strong>${number}</strong>
        ${firstName ? `<small>${firstName}</small>` : ''}
      </span>
    `;
    }

    return `
      <button type="button" class="${classes.join(' ')} quota-chip-button" data-number="${number}" aria-label="Cota ${number} de ${firstName || 'comprador'}">
        <strong>${number}</strong>
        ${firstName ? `<small>${firstName}</small>` : ''}
      </button>
    `;
  }).join('');

  const detailTargets = [...ui.quotaOverviewGrid.querySelectorAll('.quota-chip-button')];
  detailTargets.forEach((element) => {
    const ticket = soldByNumber.get(element.dataset.number || '');
    if (!ticket) {
      return;
    }

    if (isMobileInteraction()) {
      element.addEventListener('click', () => openTicketDetail(ticket));
      return;
    }

    element.addEventListener('dblclick', () => openTicketDetail(ticket));
  });
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
      
      // Redimensiona para max 480px mantendo proporção
      const maxWidth = 480;
      let { width, height } = img;
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Comprime para JPEG 60% para reduzir payload da API
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
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

    if (!state.raffles.some((r) => r.id === state.selectedRaffleId)) {
      state.selectedRaffleId = state.raffles[0].id;
    }

    renderForm();
    subscribeAllTickets();
    subscribeTickets();
  } catch (error) {
    console.error(error);
    state.raffles = DEFAULT_RAFFLES;
    state.selectedRaffleId = DEFAULT_RAFFLES[0].id;
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

function subscribeTickets() {
  if (unsubTickets) {
    unsubTickets();
  }

  const raffle = currentRaffle();
  if (!raffle) {
    return;
  }

  const ref = collection(db, 'artifacts', appId, 'public', 'data', `tickets_${raffle.id}`);
  unsubTickets = onSnapshot(ref, (snap) => {
    const sold = {};
    snap.forEach((d) => {
      sold[d.id] = d.data();
    });
    state.soldTickets = sold;
    renderBuyers();
    maybeAutoDrawIfComplete();
  });
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
  renderForm();
  showToast('Nova rifa criada.');
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
    state.selectedRaffleId = event.target.value;
    renderForm();
    subscribeTickets();
  });
  ui.buyersRaffleSelect.addEventListener('change', (event) => {
    state.selectedRaffleId = event.target.value;
    renderForm();
    subscribeTickets();
  });

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
  ui.createRaffleBtn.addEventListener('click', onCreateRaffle);
  ui.drawBtn.addEventListener('click', onDraw);

  try {
    state.user = await ensureAuth();
    await subscribeCatalog();
    subscribeSiteConfig();
    showAdminSection('section-config');
  } catch (error) {
    console.error(error);
    await subscribeCatalog();
    showToast('Falha de autenticacao. Catalogo remoto continua disponivel.');
    showAdminSection('section-config');
  }

  ui.siteConfigForm.addEventListener('submit', onSaveSiteConfig);
}

closePanel();
init();
