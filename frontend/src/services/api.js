import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

const authHeaders = () => ({});

export const getUsers = () => axios.get(`${API}/users`).then((r) => r.data);

export const loginUser = (login, password) => axios.post(`${API}/auth/login`, { login, password }).then((r) => r.data);

export const logoutUser = () => axios.post(`${API}/auth/logout`, {}).then((r) => r.data);

export const getMe = () => axios.get(`${API}/auth/me`).then((r) => r.data);

export const getOptions = () => axios.get(`${API}/config/options`).then((r) => r.data);

// -------- Work items --------
export const getWorkItems = (userId, params) =>
  axios.get(`${API}/work-items`, { headers: authHeaders(userId), params }).then((r) => r.data);

export const createWorkItem = (userId, payload) =>
  axios.post(`${API}/work-items`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const updateWorkItem = (userId, id, payload) =>
  axios.patch(`${API}/work-items/${id}`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const deleteWorkItem = (userId, id) =>
  axios.delete(`${API}/work-items/${id}`, { headers: authHeaders(userId) }).then((r) => r.data);

export const bulkCreateWorkItems = (userId, count, template) =>
  axios.post(`${API}/work-items/bulk-create`, { count, template }, { headers: authHeaders(userId) }).then((r) => r.data);

export const bulkUpdateWorkItems = (userId, ids, patch) =>
  axios.post(`${API}/work-items/bulk-update`, { ids, patch }, { headers: authHeaders(userId) }).then((r) => r.data);

export const bulkDeleteWorkItems = (userId, ids) =>
  axios.post(`${API}/work-items/bulk-delete`, { ids }, { headers: authHeaders(userId) }).then((r) => r.data);

// -------- Dashboard --------
export const getDashboardSummary = (userId) =>
  axios.get(`${API}/dashboard/summary`, { headers: authHeaders(userId) }).then((r) => r.data);

export const getDashboardTeamSummary = (userId) =>
  axios.get(`${API}/dashboard/team-summary`, { headers: authHeaders(userId) }).then((r) => r.data);

export const getDashboardAttentionItems = (userId) =>
  axios.get(`${API}/dashboard/attention-items`, { headers: authHeaders(userId) }).then((r) => r.data);

// -------- Clients --------
export const getClients = () => axios.get(`${API}/clients`).then((r) => r.data);

export const createClient = (userId, payload) =>
  axios.post(`${API}/clients`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const updateClient = (userId, id, payload) =>
  axios.patch(`${API}/clients/${id}`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

// -------- Projects --------
export const getProjects = (userId, params) =>
  axios.get(`${API}/projects`, { headers: authHeaders(userId), params }).then((r) => r.data);

export const getProjectMetrics = (userId) =>
  axios.get(`${API}/projects/metrics`, { headers: authHeaders(userId) }).then((r) => r.data);

export const getProject = (userId, id) =>
  axios.get(`${API}/projects/${id}`, { headers: authHeaders(userId) }).then((r) => r.data);

export const createProject = (userId, payload) =>
  axios.post(`${API}/projects`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const updateProject = (userId, id, payload) =>
  axios.patch(`${API}/projects/${id}`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const deleteProject = (userId, id) =>
  axios.delete(`${API}/projects/${id}`, { headers: authHeaders(userId) }).then((r) => r.data);

// -------- Deliverables --------
export const getDeliverables = (userId, params) =>
  axios.get(`${API}/deliverables`, { headers: authHeaders(userId), params }).then((r) => r.data);

export const createDeliverable = (userId, payload) =>
  axios
    .post(`${API}/deliverables`, payload, { headers: authHeaders(userId) })
    .then((r) => r.data);

export const updateDeliverable = (userId, id, payload) =>
  axios
    .patch(`${API}/deliverables/${id}`, payload, { headers: authHeaders(userId) })
    .then((r) => r.data);

// -------- Team / Users --------
export const createUser = (userId, payload) =>
  axios.post(`${API}/users`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

export const updateUser = (userId, id, payload) =>
  axios.patch(`${API}/users/${id}`, payload, { headers: authHeaders(userId) }).then((r) => r.data);

// -------- Approvals --------
export const getApprovals = (userId) =>
  axios.get(`${API}/approvals`, { headers: authHeaders(userId) }).then((r) => r.data);

export const approveDeliverable = (userId, id, note = "") =>
  axios.post(`${API}/deliverables/${id}/approve`, { note }, { headers: authHeaders(userId) }).then((r) => r.data);

export const rejectDeliverable = (userId, id, note = "") =>
  axios.post(`${API}/deliverables/${id}/reject`, { note }, { headers: authHeaders(userId) }).then((r) => r.data);

export const getDashboardOverview = (userId) =>
  axios.get(`${API}/dashboard/overview`, { headers: authHeaders(userId) }).then((r) => r.data);