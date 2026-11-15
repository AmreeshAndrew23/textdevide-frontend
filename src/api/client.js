import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
// Same host as the API, without the /api suffix — the server-rendered screen route
// (GET /runtime/projects/:id/screens/:screenId) lives outside that prefix.
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_URL,
  // Needed so the browser sends/accepts the Runtime Engine's own per-application end-user session
  // cookie (see backend-node's runtimeEngine/appAuth.ts) — harmless for every other call, which
  // keeps authenticating via the Bearer token above and has no cookie to send anyway.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Requests that use the AI allowance — when one finishes (or is refused for being over it), the
// usage meter refreshes. The event name matches components/AiUsageMeter.jsx's AI_USAGE_EVENT.
const AI_ROUTES = /\/runtime-applications\/(generate|\d+\/(ask|design|sample-data))$/;
const aiUsed = (config) => config?.method === "post" && AI_ROUTES.test(config.url || "");
api.interceptors.response.use(
  (res) => {
    if (aiUsed(res.config)) window.dispatchEvent(new Event("textdev:ai-usage"));
    return res;
  },
  (error) => {
    if (aiUsed(error.config)) window.dispatchEvent(new Event("textdev:ai-usage"));
    return Promise.reject(error);
  }
);

export default api;
