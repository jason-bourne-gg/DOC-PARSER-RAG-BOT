/* 
Description: Main entry point for the application. 
This file is responsible for starting the server and serving the frontend. 
It also sets up the API routes and middleware for the application.
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { router as apiRouter } from './routes/api.js';
import dns from 'dns';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes, currently now using any auth scheme, hence no middleware for auth
app.use('/api', apiRouter);

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Initial DNS resolution was taking time, hence added this in begining of app for fast resolution
dns.lookup('api.openai.com', (err, address) => {
  if (err) {
    console.error('DNS Lookup Failed:', err);
  } else {
    console.log('Resolved API OpenAI to:', address);
  }
});