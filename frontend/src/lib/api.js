const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_KEY = 'kirisuite_token';
const RACE_CACHE_MS = 2 * 60 * 1000;
const raceRequests = new Map();
const raceCache = new Map();

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    throw new ApiError('セッションが切れました。再度ログインしてください。', 401);
  }
  if (!res.ok) {
    let detail = 'エラーが発生しました。';
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (e) { /* noop */ }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

function readCachedRace(id) {
  const cached = raceCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > RACE_CACHE_MS) {
    raceCache.delete(id);
    return null;
  }
  return cached.data;
}

function cacheRace(id, data) {
  // 大きな過去走JSONをsessionStorageへ同期書込みするとメインスレッドが止まるため、
  // タブ内のメモリだけに短時間保持する。
  raceCache.set(id, { savedAt: Date.now(), data });
  return data;
}

function invalidateRace(id) {
  raceCache.delete(id);
}

function invalidateRaceContainingHorse(horseId) {
  for (const [raceId, cached] of raceCache.entries()) {
    if (cached.data?.horses?.some(horse => horse.id === horseId)) {
      raceCache.delete(raceId);
    }
  }
}

function fetchRace(id) {
  if (raceRequests.has(id)) return raceRequests.get(id);
  const pending = request(`/races/${id}`)
    .then(data => cacheRace(id, data))
    .finally(() => raceRequests.delete(id));
  raceRequests.set(id, pending);
  return pending;
}

export const api = {
  login: (password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),

  listRaces: () => request('/races'),
  getCachedRace: (id) => readCachedRace(id),
  getRace: (id) => readCachedRace(id) || fetchRace(id),
  prefetchRace: (id) => {
    const cached = readCachedRace(id);
    return cached ? Promise.resolve(cached) : fetchRace(id);
  },
  refreshRace: (id) => {
    invalidateRace(id);
    return fetchRace(id);
  },
  createRace: (data) => request('/races', { method: 'POST', body: JSON.stringify(data) }),
  updateRace: (id, data) => request(`/races/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    .then(result => { invalidateRace(id); return result; }),
  deleteRace: (id) => request(`/races/${id}`, { method: 'DELETE' })
    .then(result => { invalidateRace(id); return result; }),

  addHorse: (raceId, data) => request(`/horses/race/${raceId}`, { method: 'POST', body: JSON.stringify(data) })
    .then(result => { invalidateRace(raceId); return result; }),
  updateHorse: (id, data) => request(`/horses/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    .then(result => { invalidateRaceContainingHorse(id); return result; }),
  deleteHorse: (id) => request(`/horses/${id}`, { method: 'DELETE' })
    .then(result => { invalidateRaceContainingHorse(id); return result; }),
  searchHorses: (q) => request(`/horses/search?q=${encodeURIComponent(q)}`),
  importCsv: (raceId, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/horses/race/${raceId}/import-csv`, { method: 'POST', body: form });
  },
  importJraUrl: (raceId, url) =>
    request(`/horses/race/${raceId}/import-jra-url`, { method: 'POST', body: JSON.stringify({ url }) }),
  inferStyles: (raceId) => request(`/horses/race/${raceId}/infer-styles`, { method: 'POST' }),
};

export { ApiError };
