const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export type AuthUser = {
  token: string;
  user_id: string;
  username: string;
  role: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL || "/nlp";
  let basePath = configured.replace(/\/$/, "");
  try {
    basePath = new URL(configured).pathname.replace(/\/$/, "");
  } catch {}
  window.location.href = basePath || "/";
}
