/**
 * 资源 URL 解析：场景包里的 url 允许相对路径，解析基准由调用方传 baseUrl。
 * baseUrl 本身也允许是相对路径（如 '/sample/'）：浏览器下以当前页面地址为根，
 * 否则 `new URL(url, baseUrl)` 会直接抛 'Invalid base URL'。
 */
export function resolveAssetUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) {
    return url;
  }
  const base =
    typeof window === 'undefined'
      ? baseUrl
      : new URL(baseUrl, window.location.href).toString();
  return new URL(url, base).toString();
}
