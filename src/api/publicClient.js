import axios from "axios";

// The API client for a published app at /a/:slug — separate from api/client.js on purpose, so a
// Studio builder's token is never sent to an app's public routes (and vice versa). An app user's
// session lives in its own per-app token.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const keyFor = (slug) => `textdev.app.${slug}`;

function readToken(slug) {
  try {
    return localStorage.getItem(keyFor(slug));
  } catch {
    return null;
  }
}

export function setAppToken(slug, token) {
  try {
    localStorage.setItem(keyFor(slug), token);
  } catch {
    // Storage blocked: the user just stays signed in until they leave the page's state.
  }
}

export function clearAppToken(slug) {
  try {
    localStorage.removeItem(keyFor(slug));
  } catch {
    // Nothing stored, so nothing to clear.
  }
}

const clients = new Map();

export function publicClientFor(slug) {
  if (clients.has(slug)) return clients.get(slug);
  const client = axios.create({ baseURL: API_URL });
  client.interceptors.request.use((config) => {
    const token = readToken(slug);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  // An expired or revoked session: drop it and start again from the sign-in screen.
  client.interceptors.response.use(undefined, (error) => {
    if (error.response?.status === 401 && readToken(slug)) {
      clearAppToken(slug);
      window.location.reload();
    }
    return Promise.reject(error);
  });
  clients.set(slug, client);
  return client;
}
