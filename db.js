import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Initialize database with required tables and extensions
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create the pgvector extension if it doesn't exist
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    
    // Create documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        filepath TEXT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create chunks table with vector support
    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        metadata JSONB,
        embedding vector(1536),
        chunk_index INTEGER
      );
    `);
    
    // Create index for faster vector similarity search
    await client.query(`
      CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks 
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
}

// Call initialization
initializeDatabase().catch(console.error);

export default pool;