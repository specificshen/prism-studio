/**
 * 资源 URL 解析：场景包里的 url 允许相对路径，解析基准由调用方传 baseUrl。
 */
export function resolveAssetUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) {
    return url;
  }
  return new URL(url, baseUrl).toString();
}
