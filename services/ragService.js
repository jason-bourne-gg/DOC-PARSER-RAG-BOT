// Description: Service to handle RAG (Retrieval-Augmented Generation) queries.
import pool from '../db.js';
import { getEmbeddings } from './documentService.js';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';


// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Function to re-rank chunks based on various factors
export async function reRankChunks(chunks, query) {
  // Constants for weighting different factors
  const SEMANTIC_WEIGHT = 0.5;
  const POSITION_WEIGHT = 0.15;
  const PAGE_WEIGHT = 0.1;
  const RECENCY_WEIGHT = 0.1;
  const LENGTH_WEIGHT = 0.05;
  const QUERY_TERM_MATCH_WEIGHT = 0.1;
  
  // Normalize a value between min and max to 0-1 range
  const normalize = (value, min, max) => {
    if (min === max) return 0.5;
    return (value - min) / (max - min);
  };
  
  // Get min/max values for normalization
  const getMinMax = (array, getter) => {
    const values = array.map(getter).filter(v => !isNaN(v));
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  };
  
  // Process query for term matching
  const queryTerms = query.toLowerCase().split(/\W+/).filter(term => term.length > 2);
  
  // Extract statistics for normalization
  const chunkIndices = chunks.map(c => c.chunk_index || 0);
  const maxChunkIndex = Math.max(...chunkIndices);
  
  const pageStats = getMinMax(chunks, c => {
    const metadata = typeof c.metadata === 'string' ? 
      JSON.parse(c.metadata || '{}') : (c.metadata || {});
    return metadata.page || 0;
  });
  
  const dateStats = getMinMax(chunks, c => {
    const metadata = typeof c.metadata === 'string' ? 
      JSON.parse(c.metadata || '{}') : (c.metadata || {});
    return metadata.created_at ? new Date(metadata.created_at).getTime() : 0;
  });
  
  const lengthStats = getMinMax(chunks, c => c.text ? c.text.length : 0);
  
  // Process each chunk
  return chunks.map(chunk => {
    // Parse metadata safely
    let metadata = {};
    try {
      metadata = typeof chunk.metadata === 'string' ? 
        JSON.parse(chunk.metadata || '{}') : (chunk.metadata || {});
    } catch (e) {
      metadata = {};
    }
    
    // Original semantic similarity score
    const semanticScore = chunk.similarity || 0;
    
    // Position in document boost (earlier chunks may be more important like intros, summaries)
    const chunkIndex = chunk.chunk_index || 0;
    const positionScore = 1 - (chunkIndex / (maxChunkIndex || 1));
    
    // Page number boost (earlier pages often contain key information)
    const page = metadata.page || 0;
    const pageScore = page ? 1 - normalize(page, pageStats.min, pageStats.max) : 0;
    
    // Recency boost if timestamps are available
    let recencyScore = 0;
    if (metadata.created_at) {
      const timestamp = new Date(metadata.created_at).getTime();
      recencyScore = normalize(timestamp, dateStats.min, dateStats.max);
    }
    
    // Length normalization (prefer medium-length chunks over very short or very long)
    const textLength = chunk.text ? chunk.text.length : 0;
    const normalizedLength = normalize(textLength, lengthStats.min, lengthStats.max);
    // We prefer chunks that are medium length (not too short, not too long)
    const lengthScore = normalizedLength > 0.5 ? 
      1 - (normalizedLength - 0.5) * 2 : normalizedLength * 2;
    
    // Count query term matches in the chunk text
    let queryTermMatchScore = 0;
    if (chunk.text && queryTerms.length > 0) {
      const text = chunk.text.toLowerCase();
      const matchCount = queryTerms.reduce((count, term) => {
        return count + (text.includes(term) ? 1 : 0);
      }, 0);
      queryTermMatchScore = matchCount / queryTerms.length;
    }
    
    // Calculate weighted final score
    const rerankedScore = 
      semanticScore * SEMANTIC_WEIGHT +
      positionScore * POSITION_WEIGHT +
      pageScore * PAGE_WEIGHT +
      recencyScore * RECENCY_WEIGHT +
      lengthScore * LENGTH_WEIGHT +
      queryTermMatchScore * QUERY_TERM_MATCH_WEIGHT;
    
    // Return chunk with additional scoring information
    return {
      ...chunk,
      original_similarity: semanticScore,
      similarity: rerankedScore,
      score_components: {
        semantic: semanticScore,
        position: positionScore,
        page: pageScore,
        recency: recencyScore,
        length: lengthScore,
        query_term_match: queryTermMatchScore
      }
    };
  }).sort((a, b) => b.similarity - a.similarity);
}

// Function to get relevant chunks for a query
export async function getRelevantChunks(query, documentId = null, limit = 10) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await getEmbeddings(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to generate embedding for query.");
    }

    // Get the embedding array and convert to string for the query
    const embeddingArray = queryEmbedding[0];
    const embeddingString = `[${embeddingArray.join(',')}]`;

    let queryParams = [embeddingString]; // Properly formatted for pgvector
    let paramIndex = 2; // Start index for additional parameters

    // Build the SQL query 
    let queryText = `
      SELECT id, document_id, text, metadata, chunk_index,
             1 - (embedding <=> $1::vector) as similarity
      FROM chunks
      WHERE 1 = 1
    `;

    // Add document filter if provided (optional)
    if (documentId) {
      queryText += ` AND document_id = $${paramIndex}`;
      queryParams.push(documentId);
      paramIndex++;
    }

    // Order by similarity and limit results
    queryText += ` ORDER BY similarity DESC LIMIT ${limit}`;

    // Add logging for debugging
    console.log("Executing query:", queryText);
    console.log("Query params length:", queryParams.length);

    // Execute the query
    const result = await pool.query(queryText, queryParams);
    
    console.log(`Retrieved ${result.rows.length} chunks`);
    return result.rows;
  } catch (error) {
    console.error('Error retrieving relevant chunks:', error);
    console.error('Error details:', error.stack);
    throw error;
  }
}

// Function to generate an answer using Claude
export async function generateAnswer(query, chunks, maxChunks = 5) {
  try {
    // take the top ones
    const topChunks = chunks.slice(0, maxChunks);
    
    // Prepare context from chunks
    const context = topChunks.map(chunk => chunk.text).join('\n\n');
    
    // Generate prompt for Claude
    const prompt = `
    You are an AI assistant specializing in answering questions based on provided document content.

    Here is the context from the document:
    ---
    ${context}
    ---

    Question: ${query}

    <thinking>
    First, carefully analyze the context to identify all relevant information. 
    Consider what directly answers the question and what provides important context. 
    Think through any implications or connections in the text that might not be explicitly stated. 
    Formulate a comprehensive answer based solely on this information. 
    Check if there's enough information to answer the question completely.
    </thinking>

    Please provide a comprehensive and accurate answer based solely on the information in the provided context. If the context doesn't contain enough information to answer the question, please state that clearly.
    `;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      temperature: 0.3,
      system: "You are a helpful documents assistant. Only provide information that is supported by the context. Respond concisely and accurately.",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    return {
      answer: response.content[0].text,
      used_chunks: topChunks.map(c => c.id),
      all_chunks: chunks
    };
  } catch (error) {
    console.error('Error generating answer:', error);
    throw error;
  }
}

// Main function to process a query with improved error handling
export async function processQuery(query, documentId = null) {
  try {
    console.log(`Processing query: "${query}"`);
    
    // Get relevant chunks
    console.log("Fetching relevant chunks...");
    const chunks = await getRelevantChunks(query, documentId, 15);
    
    if (!chunks || chunks.length === 0) {
      console.log("No relevant chunks found");
      return {
        answer: "I couldn't find any relevant information in the documents to answer your question.",
        used_chunks: [],
        all_chunks: []
      };
    }
    
    // Re-rank chunks
    console.log("Re-ranking chunks...");
    const rerankedChunks = await reRankChunks(chunks, query);
    
    // Generate answer
    console.log("Generating answer...");
    const result = await generateAnswer(query, rerankedChunks);
    
    return result;
  } catch (error) {
    console.error("Error in processQuery:", error);
    throw error;
  }
}