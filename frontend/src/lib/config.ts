export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("durhack_backend_url");
    if (saved) return saved.trim();
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
      return process.env.NEXT_PUBLIC_BACKEND_URL.trim();
    }
    return "https://durhack26.tend-to.dev";
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "https://durhack26.tend-to.dev";
}

export function getBackendWsUrl(): string {
  const httpUrl = getBackendUrl();
  return httpUrl.replace(/^http/, "ws");
}

export function setCustomBackendUrl(url: string) {
  if (typeof window !== "undefined") {
    if (!url) {
      localStorage.removeItem("durhack_backend_url");
    } else {
      localStorage.setItem("durhack_backend_url", url.trim());
    }
  }
}
