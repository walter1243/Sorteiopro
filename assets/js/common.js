export const MP_CONFIG = {
  PUBLIC_KEY: 'APP_USR-7733074d-f28f-4374-9c38-d875aa3ad421',
  ACCESS_TOKEN: 'APP_USR-5522921031209003-021910-dddd5ef66e282053181508421bc9b411-277267651'
};

export const ADMIN_CREDENTIALS = {
  username: 'walter',
  password: 'wj1234'
};

export const DEFAULT_RAFFLES = [
  {
    id: 'fusion_2008_sel_black',
    title: 'Ford Fusion 2008',
    prizeName: 'Ford Fusion 2008',
    edition: 'SEL 2.3 Luxury Edition',
    totalValue: 50000,
    price: 50,
    totalQuotas: 1000,
    imageUrl: 'https://images.pexels.com/photos/3802517/pexels-photo-3802517.jpeg?w=400&h=300&fit=crop',
    status: 'active',
    drawMethod: 'random_internal',
    winner: null
  },
  {
    id: 'honda_civic_lxr_2014',
    title: 'Honda Civic LXR 2014',
    prizeName: 'Honda Civic LXR 2014',
    edition: 'Completo',
    totalValue: 28000,
    price: 35,
    totalQuotas: 800,
    imageUrl: 'https://images.pexels.com/photos/2103284/pexels-photo-2103284.jpeg?w=400&h=300&fit=crop',
    status: 'paused',
    drawMethod: 'random_internal',
    winner: null
  }
];

export function formatCurrency(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

export function normalizeQuotaNumber(index) {
  return index.toString().padStart(3, '0');
}

export function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
  }, 2800);
}

export function statusLabel(status) {
  if (status === 'active') {
    return 'Ativa';
  }

  if (status === 'paused') {
    return 'Pausada';
  }

  if (status === 'drawn') {
    return 'Encerrada';
  }

  return 'Indefinida';
}
