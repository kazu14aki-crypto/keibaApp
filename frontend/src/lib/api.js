const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_KEY = 'kirisuite_token';
const RACE_CACHE_PREFIX = 'kirisuite_race_';
const RACE_CACHE_MS = 2 * 60 * 1000;
const raceRequests = new Map();

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
  try {
    const raw = sessionStorage.getItem(`${RACE_CACHE_PREFIX}${id}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.data || Date.now() - cached.savedAt > RACE_CACHE_MS) {
      sessionStorage.removeItem(`${RACE_CACHE_PREFIX}${id}`);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function cacheRace(id, data) {
  try {
    sessionStorage.setItem(`${RACE_CACHE_PREFIX}${id}`, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage is only a speed-up; the API response remains authoritative.
  }
  return data;
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
  prefetchRace: (id) => readCachedRace(id) ? Promise.resolve(readCachedRace(id)) : fetchRace(id),
  refreshRace: (id) => {
    try { sessionStorage.removeItem(`${RACE_CACHE_PREFIX}${id}`); } catch { /* noop */ }
    return fetchRace(id);
  },
  createRace: (data) => request('/races', { method: 'POST', body: JSON.stringify(data) }),
  updateRace: (id, data) => request(`/races/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRace: (id) => request(`/races/${id}`, { method: 'DELETE' }),

  addHorse: (raceId, data) => request(`/horses/race/${raceId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateHorse: (id, data) => request(`/horses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteHorse: (id) => request(`/horses/${id}`, { method: 'DELETE' }),
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
