/** 统一 API 封装；错误消息直接来自后端校验，原样弹给车间看 */
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  listMolds: () => request('/api/molds'),
  createMold: (body) => request('/api/molds', { method: 'POST', body }),
  listMachines: () => request('/api/machines'),
  listTrials: () => request('/api/trials'),
  bookTrial: (body) => request('/api/trials', { method: 'POST', body }),
  recordVerdict: (id, body) => request(`/api/trials/${id}/verdict`, { method: 'POST', body }),
  openRepairFromTrial: (id, body) => request(`/api/trials/${id}/repair`, { method: 'POST', body }),
  listRepairs: () => request('/api/repairs'),
  repairDetail: (id) => request(`/api/repairs/${id}`),
  createRepair: (body) => request('/api/repairs', { method: 'POST', body }),
  markReturned: (id, body) => request(`/api/repairs/${id}/return`, { method: 'POST', body }),
  acceptRepair: (id, body) => request(`/api/repairs/${id}/accept`, { method: 'POST', body }),
  rejectRepair: (id, body) => request(`/api/repairs/${id}/reject`, { method: 'POST', body }),
  listRuns: () => request('/api/runs'),
  addRun: (body) => request('/api/runs', { method: 'POST', body }),
  monthly: (month) => request(`/api/reports/monthly?month=${encodeURIComponent(month)}`)
};

/** 本地时区的今天，日期/时间输入框默认值（不做 UTC 转换） */
export function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function thisMonthLocal() {
  return todayLocal().slice(0, 7);
}
