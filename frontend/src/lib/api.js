const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_KEY = 'kirisuite_token';

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

export const api = {
  login: (password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),

  listRaces: () => request('/races'),
  getRace: (id) => request(`/races/${id}`),
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
};

export { ApiError };
