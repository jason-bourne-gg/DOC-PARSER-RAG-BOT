// Add this at the top of your file
import fs from 'fs';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { DocxLoader } from 'langchain/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import pool from '../db.js';
import axios from 'axios';
import path from 'path';

// Function to get embeddings using OpenAI API
export async function getEmbeddings(texts) {
  try {
    if (!Array.isArray(texts)) {
      texts = [texts];
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: "text-embedding-3-large",
        input: texts,
        dimensions: 1536  // Specify exactly 1536 dimensions for embeddings,
        /* coz large model with low dimesnions can actually give better quality results and save on storage costs as well! */
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    // Return the array of embeddings in the order they were requested
    return response.data.data.map(item => item.embedding);
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}

// Process chunks in batches to avoid rate limiting
async function processChunks(chunks, documentId, client, batchSize = 50) {
  try {
    // Process in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Get texts for the current batch
      const batchTexts = batch.map(chunk => chunk.pageContent);
      
      // Get embeddings for all texts in this batch (in a single API call)
      const batchEmbeddings = await getEmbeddings(batchTexts);
      
      // Process each chunk in the batch
      const batchPromises = batch.map(async (chunk, index) => {
        const batchIndex = i + index;
        const embeddingArray = batchEmbeddings[index];
        
        return client.query(
          'INSERT INTO chunks (document_id, text, metadata, embedding, chunk_index) VALUES ($1, $2, $3, $4::vector, $5)',
          [documentId, chunk.pageContent, JSON.stringify(chunk.metadata), `[${embeddingArray.join(',')}]`, batchIndex]
        );        
      });
      
      // Execute all inserts for this batch in parallel
      await Promise.all(batchPromises);
      
      console.log(`Processed batch ${Math.floor(i/batchSize) + 1}, chunks ${i+1}-${Math.min(i+batchSize, chunks.length)}`);
    }
  } catch (error) {
    console.error("Error in processChunks:", error);
    throw error;
  }
}

// Document processing service with transaction
export async function processDocument(filePath, title) {
  const client = await pool.connect(); // Get a client from the pool
  try {
    await client.query('BEGIN'); // Start transaction

    // Determine document type and load accordingly
    const ext = path.extname(filePath).toLowerCase();
    let docs;
    
    if (ext === '.pdf') {
      const loader = new PDFLoader(filePath);
      docs = await loader.load();
    } else if (ext === '.docx') {
      const loader = new DocxLoader(filePath);
      docs = await loader.load();
    } else if (ext === '.txt' || ext === '.md') {
      const loader = new TextLoader(filePath);
      docs = await loader.load();
    } else {
      throw new Error('Unsupported file format');
    }

    // Create document record in database
    const docResult = await client.query(
      'INSERT INTO documents (title, filepath) VALUES ($1, $2) RETURNING id',
      [title, filePath]
    );
    const documentId = docResult.rows[0].id;

    // Chunk the document
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // Process the documents with semantic chunking
    const chunks = await splitter.splitDocuments(docs);

    console.log('Document Chunked:', title, 'Chunks:', chunks.length);

    // Process chunks in batches to avoid rate limiting
    await processChunks(chunks, documentId, client);

    await client.query('COMMIT'); // Commit transaction if everything is successful

    return {
      documentId,
      chunkCount: chunks.length
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction in case of an error
    console.error('Error processing document:', error);
    throw error;
  } finally {
    client.release(); // Release the client back to the pool
  }
}

// Get document by ID
export async function getDocumentById(id) {
  const result = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
  return result.rows[0];
}

// Get all documents
export async function getAllDocuments() {
  const result = await pool.query('SELECT * FROM documents ORDER BY upload_date DESC');
  return result.rows;
}

// Delete document
export async function deleteDocument(id) {
  await pool.query('DELETE FROM documents WHERE id = $1', [id]);
  return { success: true };
}