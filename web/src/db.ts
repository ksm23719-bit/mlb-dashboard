import * as duckdb from '@duckdb/duckdb-wasm'

const R2_URL = 'https://pub-9a246ed4137c4561ad1baaf7d078a016.r2.dev/mlb.duckdb'

let _db: duckdb.AsyncDuckDB | null = null
let _conn: duckdb.AsyncDuckDBConnection | null = null

export async function getDB(
  onProgress?: (pct: number) => void
): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db

  const JSDELIVR = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/`
  const bundle = await duckdb.selectBundle({
    mvp: {
      mainModule: JSDELIVR + 'duckdb-mvp.wasm',
      mainWorker: JSDELIVR + 'duckdb-browser-mvp.worker.js',
    },
    eh: {
      mainModule: JSDELIVR + 'duckdb-eh.wasm',
      mainWorker: JSDELIVR + 'duckdb-browser-eh.worker.js',
    },
  })

  const worker = await duckdb.createWorker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  _db = new duckdb.AsyncDuckDB(logger, worker)
  await _db.instantiate(bundle.mainModule)

  // R2에서 DuckDB 파일 다운로드
  onProgress?.(0)
  const resp = await fetch(R2_URL)
  const total = Number(resp.headers.get('content-length') ?? 0)
  const reader = resp.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total) onProgress?.(Math.round((received / total) * 100))
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  await _db.registerFileBuffer('mlb.duckdb', buffer)
  onProgress?.(100)

  return _db
}

export async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (_conn) return _conn
  const db = await getDB()
  _conn = await db.connect()
  await _conn.query("ATTACH 'mlb.duckdb' AS mlb (READ_ONLY)")
  return _conn
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConn()
  const result = await conn.query(sql)
  return result.toArray().map((row) => row.toJSON() as T)
}
