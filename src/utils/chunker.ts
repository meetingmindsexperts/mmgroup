import { CONFIG } from '../config';

// Text chunking for RAG ingestion

export interface Chunk {
  content: string;
  index: number;
}

/**
 * Split text into overlapping chunks for embedding
 */
export function chunkText(
  text: string,
  chunkSize: number = CONFIG.rag.chunkSize,
  overlap: number = CONFIG.rag.chunkOverlap
): Chunk[] {
  // Clean up the text
  const cleaned = text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  if (cleaned.length <= chunkSize) {
    return [{ content: cleaned, index: 0 }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;

    // Try to break at a sentence boundary
    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end + 50); // Look ahead a bit
      const sentenceEnd = findSentenceEnd(slice, chunkSize);
      if (sentenceEnd > chunkSize * 0.5) {
        // Only use if it's not too short
        end = start + sentenceEnd;
      }
    }

    const chunk = cleaned.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push({ content: chunk, index });
      index++;
    }

    start = end - overlap;

    // Prevent infinite loop
    if (start >= cleaned.length - overlap) {
      break;
    }
  }

  return chunks;
}

function findSentenceEnd(text: string, maxLength: number): number {
  // Look for sentence endings within the chunk
  const endings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];

  let lastEnd = -1;

  for (const ending of endings) {
    let pos = text.lastIndexOf(ending, maxLength);
    if (pos > lastEnd) {
      lastEnd = pos + 1; // Include the punctuation
    }
  }

  return lastEnd > 0 ? lastEnd : maxLength;
}

/**
 * Generate a unique ID for a chunk
 */
export function generateChunkId(sourceId: string, chunkIndex: number): string {
  return `${sourceId}_chunk_${chunkIndex}`;
}
