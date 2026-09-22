import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
// Same host as the API, without the /api suffix — the server-rendered screen route
// (GET /runtime/projects/:id/screens/:screenId) lives outside that prefix.
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
