const R2_BASE = 'https://pub-9a246ed4137c4561ad1baaf7d078a016.r2.dev'

export async function fetchJSON<T>(path: string): Promise<T> {
  const resp = await fetch(`${R2_BASE}/${path}`)
  if (!resp.ok) throw new Error(`fetch ${path} failed: ${resp.status}`)
  return resp.json()
}
