import type { Env, IngestRequest } from '../types';
import { createEmbeddingsProvider } from '../providers/embeddings';
import { createVectorStoreProvider } from '../providers/vectorstore';
import { chunkText, generateChunkId } from '../utils/chunker';

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as IngestRequest;

    if (!body.content || typeof body.content !== 'string') {
      return Response.json({ error: 'Content is required' }, { status: 400 });
    }

    const content = body.content.trim();

    if (content.length === 0) {
      return Response.json({ error: 'Content cannot be empty' }, { status: 400 });
    }

    // Initialize providers
    const embeddings = createEmbeddingsProvider(env);
    const vectorStore = createVectorStoreProvider(env);

    // Generate a source ID from URL or random
    const sourceId = body.metadata?.url
      ? btoa(body.metadata.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
      : crypto.randomUUID();

    // Chunk the content
    const chunks = chunkText(content);

    // Embed all chunks in batch
    const chunkContents = chunks.map((c) => c.content);
    const chunkEmbeddings = await embeddings.embedBatch(chunkContents);

    // Store each chunk
    const stored: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = generateChunkId(sourceId, chunks[i].index);

      await vectorStore.upsert(chunkId, chunks[i].content, chunkEmbeddings[i], body.metadata);

      stored.push(chunkId);
    }

    return Response.json({
      success: true,
      message: `Ingested ${chunks.length} chunks`,
      sourceId,
      chunks: stored,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    return Response.json(
      { error: 'An error occurred during ingestion' },
      { status: 500 }
    );
  }
}

// Bulk ingest multiple documents
export async function handleBulkIngest(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { documents: IngestRequest[] };

    if (!Array.isArray(body.documents)) {
      return Response.json({ error: 'Documents array is required' }, { status: 400 });
    }

    const results: Array<{ sourceId: string; chunks: number; error?: string }> = [];

    for (const doc of body.documents) {
      try {
        if (!doc.content || typeof doc.content !== 'string') {
          results.push({ sourceId: 'unknown', chunks: 0, error: 'Invalid content' });
          continue;
        }

        const embeddings = createEmbeddingsProvider(env);
        const vectorStore = createVectorStoreProvider(env);

        const sourceId = doc.metadata?.url
          ? btoa(doc.metadata.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
          : crypto.randomUUID();

        const chunks = chunkText(doc.content.trim());
        const chunkEmbeddings = await embeddings.embedBatch(chunks.map((c) => c.content));

        for (let i = 0; i < chunks.length; i++) {
          const chunkId = generateChunkId(sourceId, chunks[i].index);
          await vectorStore.upsert(chunkId, chunks[i].content, chunkEmbeddings[i], doc.metadata);
        }

        results.push({ sourceId, chunks: chunks.length });
      } catch (err) {
        results.push({
          sourceId: 'unknown',
          chunks: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return Response.json({
      success: true,
      results,
      total: results.reduce((sum, r) => sum + r.chunks, 0),
    });
  } catch (error) {
    console.error('Bulk ingest error:', error);
    return Response.json(
      { error: 'An error occurred during bulk ingestion' },
      { status: 500 }
    );
  }
}

// Get vector store stats
export async function handleStats(request: Request, env: Env): Promise<Response> {
  try {
    const vectorStore = createVectorStoreProvider(env);
    const stats = await vectorStore.stats();

    return Response.json({
      vectorStore: env.VECTOR_STORE || 'kv',
      llmProvider: env.LLM_PROVIDER || 'openai',
      embeddingProvider: env.EMBEDDING_PROVIDER || 'openai',
      ...stats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return Response.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
