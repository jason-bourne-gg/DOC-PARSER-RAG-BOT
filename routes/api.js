// routes/api.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processDocument, getDocumentById, getAllDocuments, deleteDocument } from '../services/documentService.js';
import { processQuery } from '../services/ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const router = express.Router();

// Upload and process document
router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const title = req.body.title || req.file.originalname;
    const result = await processDocument(req.file.path, title);
    
    res.status(201).json({
      message: 'Document processed successfully',
      document: {
        id: result.documentId,
        title,
        chunkCount: result.chunkCount
      }
    });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'Error processing document' });
  }
});

// Get all documents
router.get('/documents', async (req, res) => {
  try {
    const documents = await getAllDocuments();
    res.json(documents);
  } catch (error) {
    console.error('Error retrieving documents:', error);
    res.status(500).json({ error: 'Error retrieving documents' });
  }
});

// Get document by ID
router.get('/documents/:id', async (req, res) => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Error retrieving document:', error);
    res.status(500).json({ error: 'Error retrieving document' });
  }
});

// Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    await deleteDocument(req.params.id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// Process query
router.post('/query', async (req, res) => {
  try {
    const { query, documentId } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Empty query recieved! Query is required' });
    }
    
    const result = await processQuery(query, documentId || null);
    res.json(result);
  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({ error: 'Error processing query' });
  }
});

export { router };