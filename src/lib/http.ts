// src/lib/http.ts
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.ok === false)) {
    const err = (data && (data.error || data.message)) || `Error ${res.status}`;
    throw new Error(err);
  }
  return (data?.project ?? data?.data ?? data) as T;
}

export const api = {
  get:  <T>(p: string) => http<T>(p),
  post: <T>(p: string, body: unknown) =>
    http<T>(p, { method: "POST", body: JSON.stringify(body) }),
  put:  <T>(p: string, body: unknown) =>
    http<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  del:  <T>(p: string) => http<T>(p, { method: "DELETE" }),
};
