# Doc Parser RAG Bot

Ask questions about your own documents and get answers grounded in their actual
contents. Upload a PDF, DOCX, TXT or Markdown file; the text is chunked,
embedded, and stored in **PostgreSQL with `pgvector`**. A question retrieves the
nearest chunks, re-ranks them, and hands them to **Claude** to answer from.

**Stack:** Node · Express · PostgreSQL + pgvector · LangChain loaders · OpenAI embeddings · Anthropic Claude

![The upload and question UI](PORTAL%20SS.png)

## How it works

```
upload ──▶ loader (PDF / DOCX / TXT / MD)
            │
            ▼
       chunk  ──▶ embed ──▶ store as vectors in Postgres (pgvector)
                                    │
question ──▶ embed ──▶ similarity search ──▶ re-rank ──▶ Claude ──▶ answer
```

Chunks are re-ranked after retrieval rather than passed to the model raw, so the
prompt carries the passages that actually answer the question instead of the ones
that merely score well on cosine distance.

## Run it

**Prerequisites:** Node 18+, PostgreSQL with the `pgvector` extension, an
Anthropic API key, and an OpenAI API key (embeddings only).

```bash
git clone https://github.com/jason-bourne-gg/DOC-PARSER-RAG-BOT.git
cd DOC-PARSER-RAG-BOT
npm install
```

Create a `.env`:

```sh
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PASSWORD=your_db_password
DB_PORT=5432
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PORT=3000
```

Then initialise the schema and start:

```bash
node db.js     # creates the tables + vector index
npm start      # http://localhost:3000   (npm run dev for hot reload)
```

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/documents` | Upload and process a document |
| `GET` | `/api/documents` | List all documents |
| `GET` | `/api/documents/:id` | Fetch one document |
| `DELETE` | `/api/documents/:id` | Delete a document and its chunks |
| `POST` | `/api/query` | Ask a question; returns an answer plus source chunks |

## Layout

```
├── app.js                       # express bootstrap, static + multer setup
├── db.js                        # pg pool, schema init, pgvector index
├── routes/api.js                # HTTP layer
├── services/
│   ├── documentService.js       # loaders, chunking, embeddings, CRUD
│   └── ragService.js            # retrieval, re-ranking, Claude call
└── public/                      # minimal upload + chat UI
```

## Known limits

- The UI is deliberately bare — this project is about the retrieval pipeline, not the front end.
- Embeddings come from OpenAI while generation comes from Claude, so two keys are required.
- Uploads are written to local disk (`uploads/`); there is no object store or cleanup job.

## License

[MIT](LICENSE) © Aniket Ravindra Charjan
