/**
 * Gemini Embedding Service
 *
 * Wraps the Gemini `gemini-embedding-2-preview` multimodal embedding API.
 * Provides text and image embedding, vector math (cosine similarity, pairwise matrix),
 * and k-means clustering for creative fatigue detection and visual style analysis.
 *
 * All functions gracefully degrade — if the API key is not configured or calls fail,
 * callers receive null/empty results and can fall back to existing behavior.
 */

// ─── Configuration ──────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const EMBEDDING_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_TIMEOUT_MS = 30_000; // 30s — embeddings are fast
const BATCH_DELAY_MS = 200; // Delay between sequential embedding calls
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff for 429s

// ─── Types ──────────────────────────────────────────────────────────────────────

export type EmbeddingTaskType =
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING'
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT';

interface EmbedContentRequest {
  content: {
    parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    >;
  };
  taskType: EmbeddingTaskType;
  outputDimensionality: number;
}

interface EmbedContentResponse {
  embedding?: {
    values: number[];
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface SimilarityResult {
  id: string;
  similarity: number;
}

export interface ClusterResult {
  clusters: number[];   // Cluster assignment per vector (index-aligned)
  centroids: number[][]; // Centroid vectors
}

// ─── Availability Check ─────────────────────────────────────────────────────────

/**
 * Check if the embedding service is available.
 * All embedding features should call this first and silently disable if false.
 */
export function isEmbeddingAvailable(): boolean {
  return Boolean(GEMINI_API_KEY);
}

// ─── Core Embedding Functions ───────────────────────────────────────────────────

/**
 * Embed text content using Gemini embedding API.
 * Returns a normalized 768-dim vector, or null on failure.
 */
export async function embedText(
  text: string,
  taskType: EmbeddingTaskType
): Promise<number[] | null> {
  if (!isEmbeddingAvailable()) return null;
  if (!text.trim()) return null;

  const parts: EmbedContentRequest['content']['parts'] = [{ text }];
  return callEmbeddingAPI(parts, taskType);
}

/**
 * Embed multimodal content (text + image) using Gemini embedding API.
 * The text and image are aggregated into a single embedding vector.
 * Returns a normalized 768-dim vector, or null on failure.
 */
export async function embedMultimodal(
  text: string,
  imageBase64: string,
  mimeType: string,
  taskType: EmbeddingTaskType
): Promise<number[] | null> {
  if (!isEmbeddingAvailable()) return null;

  const parts: EmbedContentRequest['content']['parts'] = [];
  if (text.trim()) {
    parts.push({ text });
  }
  if (imageBase64) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  if (parts.length === 0) return null;

  return callEmbeddingAPI(parts, taskType);
}

/**
 * Internal: Call the Gemini embedding API with retry logic.
 */
async function callEmbeddingAPI(
  parts: EmbedContentRequest['content']['parts'],
  taskType: EmbeddingTaskType
): Promise<number[] | null> {
  const requestBody: EmbedContentRequest = {
    content: { parts },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      const bodyStr = JSON.stringify(requestBody);
      // Memory cleanup: release references to base64 data after serialization
      // (parts array is still referenced by requestBody, but the string is built)

      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: bodyStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429 && attempt < MAX_RETRIES) {
        // Rate limited — wait and retry
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn(`Embedding API error (${response.status}):`, errorText.slice(0, 200));
        return null;
      }

      const data: EmbedContentResponse = await response.json();

      if (data.error) {
        console.warn('Embedding API returned error:', data.error.message?.slice(0, 200));
        return null;
      }

      if (!data.embedding?.values?.length) {
        console.warn('Embedding API returned empty embedding');
        return null;
      }

      // Normalize vector (required for dimensions < 3072)
      return normalizeVector(data.embedding.values);
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn('Embedding API call timed out after', EMBEDDING_TIMEOUT_MS, 'ms');
        return null;
      }

      if (error instanceof RangeError) {
        // Payload too large (e.g., huge base64 image)
        console.warn('Embedding request payload too large');
        return null;
      }

      // On last attempt, log the error
      if (attempt >= MAX_RETRIES) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Embedding API call failed:', msg);
        return null;
      }

      // Retry on transient errors
      await sleep(RETRY_DELAYS[attempt]);
    }
  }

  return null;
}

// ─── Vector Math ────────────────────────────────────────────────────────────────

/**
 * L2-normalize a vector. Required for embedding dimensions < 3072.
 */
export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;

  const result = new Array<number>(vector.length);
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / norm;
  }
  return result;
}

/**
 * Cosine similarity between two normalized vectors.
 * Returns a value in [-1, 1] where 1 = identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Compute NxN pairwise cosine similarity matrix.
 * Returns a symmetric matrix where matrix[i][j] = similarity between vectors[i] and vectors[j].
 */
export function pairwiseSimilarityMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1; // Self-similarity
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

/**
 * Find the top-K most similar vectors to a query vector.
 */
export function findMostSimilar(
  queryVector: number[],
  candidates: Array<{ vector: number[]; id: string }>,
  topK: number
): SimilarityResult[] {
  const scored = candidates.map(c => ({
    id: c.id,
    similarity: cosineSimilarity(queryVector, c.vector),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// ─── Batch Embedding ────────────────────────────────────────────────────────────

export interface BatchEmbedItem {
  text: string;
  imageBase64?: string;
  mimeType?: string;
}

/**
 * Embed multiple items sequentially with rate-limit-safe delays.
 * Returns an array of vectors (null entries for failed embeddings).
 */
export async function batchEmbed(
  items: BatchEmbedItem[],
  taskType: EmbeddingTaskType,
  onProgress?: (completed: number, total: number) => void
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    let vector: number[] | null;
    if (item.imageBase64 && item.mimeType) {
      vector = await embedMultimodal(item.text, item.imageBase64, item.mimeType, taskType);
    } else {
      vector = await embedText(item.text, taskType);
    }

    results.push(vector);
    onProgress?.(i + 1, items.length);

    // Delay between calls to avoid rate limits (skip after last item)
    if (i < items.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

// ─── K-Means Clustering ─────────────────────────────────────────────────────────

/**
 * K-means clustering with multiple random restarts.
 * Returns cluster assignments and centroid vectors.
 */
export function kMeansClustering(
  vectors: number[][],
  k: number,
  maxIterations: number = 50,
  restarts: number = 3
): ClusterResult {
  if (vectors.length === 0 || k <= 0) {
    return { clusters: [], centroids: [] };
  }

  let bestResult: ClusterResult | null = null;
  let bestScore = -Infinity;

  for (let r = 0; r < restarts; r++) {
    const result = kMeansRun(vectors, k, maxIterations);

    // Only evaluate if we have enough data for silhouette
    if (vectors.length > k) {
      const score = silhouetteScore(vectors, result.clusters);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    } else {
      bestResult = result;
      break;
    }
  }

  return bestResult || { clusters: new Array(vectors.length).fill(0), centroids: [computeCentroid(vectors)] };
}

/**
 * Single run of k-means.
 */
function kMeansRun(vectors: number[][], k: number, maxIterations: number): ClusterResult {
  const n = vectors.length;

  // Initialize centroids using k-means++ style: random selection
  const centroidIndices = new Set<number>();
  while (centroidIndices.size < Math.min(k, n)) {
    centroidIndices.add(Math.floor(Math.random() * n));
  }
  const centroids = Array.from(centroidIndices).map(i => [...vectors[i]]);

  let clusters = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each vector to nearest centroid
    const newClusters = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(vectors[i], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = c;
        }
      }
      newClusters[i] = bestCluster;
    }

    // Check convergence
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (newClusters[i] !== clusters[i]) {
        changed = true;
        break;
      }
    }
    clusters = newClusters;

    if (!changed) break;

    // Recompute centroids
    for (let c = 0; c < centroids.length; c++) {
      const members = vectors.filter((_, i) => clusters[i] === c);
      if (members.length > 0) {
        centroids[c] = normalizeVector(computeCentroid(members));
      }
    }
  }

  // Merge small clusters (< 2 items) into nearest
  const clusterCounts = new Map<number, number>();
  for (const c of clusters) {
    clusterCounts.set(c, (clusterCounts.get(c) || 0) + 1);
  }

  for (const [clusterId, count] of clusterCounts) {
    if (count < 2 && centroids.length > 1) {
      // Find nearest other centroid
      let nearestCluster = -1;
      let bestSim = -Infinity;
      for (let c = 0; c < centroids.length; c++) {
        if (c === clusterId) continue;
        if ((clusterCounts.get(c) || 0) < 2) continue; // Don't merge into another small cluster
        const sim = cosineSimilarity(centroids[clusterId], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          nearestCluster = c;
        }
      }
      if (nearestCluster >= 0) {
        for (let i = 0; i < clusters.length; i++) {
          if (clusters[i] === clusterId) {
            clusters[i] = nearestCluster;
          }
        }
      }
    }
  }

  return { clusters, centroids };
}

/**
 * Compute centroid (mean vector) of a set of vectors.
 */
function computeCentroid(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const centroid = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += v[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    centroid[i] /= vectors.length;
  }
  return centroid;
}

/**
 * Compute silhouette score for evaluating cluster quality.
 * Returns a value in [-1, 1] where higher = better separation.
 */
export function silhouetteScore(vectors: number[][], clusters: number[]): number {
  const n = vectors.length;
  if (n < 2) return 0;

  const uniqueClusters = new Set(clusters);
  if (uniqueClusters.size < 2) return 0;

  let totalSilhouette = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = clusters[i];

    // a(i) = average distance to same-cluster members
    let sameClusterDist = 0;
    let sameClusterCount = 0;
    for (let j = 0; j < n; j++) {
      if (j === i || clusters[j] !== myCluster) continue;
      sameClusterDist += 1 - cosineSimilarity(vectors[i], vectors[j]); // Distance = 1 - similarity
      sameClusterCount++;
    }
    const a = sameClusterCount > 0 ? sameClusterDist / sameClusterCount : 0;

    // b(i) = minimum average distance to any other cluster
    let minOtherClusterDist = Infinity;
    for (const otherCluster of uniqueClusters) {
      if (otherCluster === myCluster) continue;
      let otherDist = 0;
      let otherCount = 0;
      for (let j = 0; j < n; j++) {
        if (clusters[j] !== otherCluster) continue;
        otherDist += 1 - cosineSimilarity(vectors[i], vectors[j]);
        otherCount++;
      }
      if (otherCount > 0) {
        const avgDist = otherDist / otherCount;
        if (avgDist < minOtherClusterDist) {
          minOtherClusterDist = avgDist;
        }
      }
    }
    const b = minOtherClusterDist === Infinity ? 0 : minOtherClusterDist;

    // Silhouette coefficient for point i
    const maxAB = Math.max(a, b);
    const si = maxAB === 0 ? 0 : (b - a) / maxAB;
    totalSilhouette += si;
  }

  return totalSilhouette / n;
}

/**
 * Find optimal k for k-means clustering using silhouette score.
 * Enforces: maxK = min(5, floor(N/2)), minimum 2 items per cluster.
 */
export function findOptimalK(
  vectors: number[][],
  minK: number = 2,
  maxK?: number
): number {
  const n = vectors.length;
  const effectiveMaxK = maxK ?? Math.min(5, Math.floor(n / 2));

  if (n < 4 || effectiveMaxK < minK) return minK;

  let bestK = minK;
  let bestScore = -Infinity;

  for (let k = minK; k <= effectiveMaxK; k++) {
    const result = kMeansClustering(vectors, k, 50, 2);
    const score = silhouetteScore(vectors, result.clusters);
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  return bestK;
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
