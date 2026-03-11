/**
 * IndexedDB Embedding Store
 *
 * Persists embedding vectors in IndexedDB, separate from the localStorage image cache.
 * IndexedDB provides ~50MB+ quota vs localStorage's 5MB, avoiding quota competition
 * with the base64 image cache that already consumes 2-4MB.
 *
 * Schema versioning: if the embedding model changes, call clearAllEmbeddings()
 * to force re-computation (embedding spaces are incompatible between models).
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface StoredEmbedding {
  id: string;              // adId or composite key
  vector: number[];        // 768-dim normalized embedding
  textContent: string;     // headline + body used to compute embedding
  imageHash?: string;      // Simple hash of image data for cache invalidation
  computedAt: number;      // Timestamp (ms)
  modelVersion: string;    // e.g., 'gemini-embedding-2-preview'
}

// ─── Configuration ──────────────────────────────────────────────────────────────

const DB_NAME = 'convertra_embeddings';
const DB_VERSION = 1;
const STORE_NAME = 'embeddings';
const CURRENT_MODEL_VERSION = 'gemini-embedding-2-preview';

// ─── Database Management ────────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * Open (or create) the IndexedDB database.
 * Returns the database instance, cached for subsequent calls.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('modelVersion', 'modelVersion', { unique: false });
        store.createIndex('computedAt', 'computedAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle connection loss (e.g., browser clears storage)
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn('Failed to open embedding store:', request.error?.message);
      reject(request.error);
    };
  });
}

// ─── CRUD Operations ────────────────────────────────────────────────────────────

/**
 * Get a stored embedding by ad ID.
 * Returns null if not found or on error.
 */
export async function getEmbedding(adId: string): Promise<StoredEmbedding | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(adId);

      request.onsuccess = () => {
        const result = request.result as StoredEmbedding | undefined;
        // Check model version — if stale, treat as missing
        if (result && result.modelVersion !== CURRENT_MODEL_VERSION) {
          resolve(null);
        } else {
          resolve(result || null);
        }
      };

      request.onerror = () => {
        console.warn('Failed to get embedding:', request.error?.message);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Store an embedding vector.
 */
export async function setEmbedding(
  adId: string,
  vector: number[],
  textContent: string,
  imageHash?: string
): Promise<void> {
  try {
    const db = await openDB();
    const entry: StoredEmbedding = {
      id: adId,
      vector,
      textContent,
      imageHash,
      computedAt: Date.now(),
      modelVersion: CURRENT_MODEL_VERSION,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to store embedding:', request.error?.message);
        reject(request.error);
      };
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Failed to store embedding:', msg);
  }
}

/**
 * Get all stored embeddings.
 * Returns empty array on error.
 */
export async function getAllEmbeddings(): Promise<StoredEmbedding[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as StoredEmbedding[]) || [];
        // Filter to current model version only
        resolve(results.filter(r => r.modelVersion === CURRENT_MODEL_VERSION));
      };

      request.onerror = () => {
        console.warn('Failed to get all embeddings:', request.error?.message);
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get embeddings for a specific set of ad IDs.
 * More efficient than getAllEmbeddings() when you know which IDs you need.
 */
export async function getEmbeddings(adIds: string[]): Promise<Map<string, StoredEmbedding>> {
  const result = new Map<string, StoredEmbedding>();
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      for (const id of adIds) {
        const request = store.get(id);
        request.onsuccess = () => {
          const entry = request.result as StoredEmbedding | undefined;
          if (entry && entry.modelVersion === CURRENT_MODEL_VERSION) {
            result.set(id, entry);
          }
          completed++;
          if (completed === adIds.length) {
            resolve(result);
          }
        };
        request.onerror = () => {
          completed++;
          if (completed === adIds.length) {
            resolve(result);
          }
        };
      }

      if (adIds.length === 0) resolve(result);
    });
  } catch {
    return result;
  }
}

/**
 * Delete a single embedding.
 */
export async function deleteEmbedding(adId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(adId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to delete embedding:', request.error?.message);
        resolve();
      };
    });
  } catch {
    // Silently fail
  }
}

/**
 * Clear all stored embeddings.
 * Use this when the embedding model changes (spaces are incompatible between models).
 */
export async function clearAllEmbeddings(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Embedding store cleared');
        resolve();
      };
      request.onerror = () => {
        console.warn('Failed to clear embedding store:', request.error?.message);
        resolve();
      };
    });
  } catch {
    // Silently fail
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

/**
 * Get the count of stored embeddings.
 */
export async function getEmbeddingCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Simple string hash for cache invalidation.
 * Used to detect when an image has changed and needs re-embedding.
 */
export function computeImageHash(base64Data: string): string {
  // Use first 100 + last 100 chars + length as a fast fingerprint
  // (full hash would be expensive for multi-MB base64 strings)
  const prefix = base64Data.slice(0, 100);
  const suffix = base64Data.slice(-100);
  const len = base64Data.length;
  let hash = 0;
  const str = `${prefix}${suffix}${len}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
