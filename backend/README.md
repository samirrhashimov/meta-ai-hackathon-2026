# AI Notes — Backend

Folder/note CRUD API plus AI features, built with Express + Mongoose.

## Setup

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and fill it in. The connection string needs a
database name (e.g. `ai-notes`); MongoDB creates it on first write.

## Run

```bash
npm run dev   # development (auto-restart on file change)
npm start     # plain run
```

Health check: `GET http://localhost:5000/api/health` → `{ "ok": true }`

## Endpoints

| Method | Path              | Description                        |
| ------ | ----------------- | ---------------------------------- |
| GET    | /api/folders      | List folders (`?parentId=`)        |
| POST   | /api/folders      | Create folder `{ name, parentId? }` |
| GET    | /api/folders/:id  | One folder                         |
| PUT    | /api/folders/:id  | Update `{ name?, parentId? }`      |
| DELETE | /api/folders/:id  | Delete (contents become unfiled)   |
| GET    | /api/notes        | List notes (`?folderId=`, `?search=`) |
| POST   | /api/notes        | Create note `{ title, content?, folderId?, tags?, autoSort? }` |
| GET    | /api/notes/:id    | One note                           |
| PUT    | /api/notes/:id    | Update                             |
| DELETE | /api/notes/:id    | Delete                             |
| POST   | /api/upload       | Upload file (form-data: `file` + `noteId?`, image/pdf/md, ≤10MB) |
| GET    | /uploads/<file>   | Download/view an uploaded file     |
| POST   | /api/ai/organize  | File a note with AI `{ noteId }` → `{ note, folder, created }` |
| POST   | /api/ai/chat      | Chat with tools `{ message }` → `{ reply, actions }` |
| GET    | /api/ai/chat      | Chat history (cleared on page reload) |
| DELETE | /api/ai/chat      | Clear chat history                 |
| GET    | /api/ai/insights  | Dashboard: stats + AI digest (`?refresh=1`) |

Error format: `{ "error": "message" }` + status code (400/404/500).

## AI

Without `META_API_KEY` in `.env` the AI is off: `/api/ai/organize` and
`/api/ai/chat` return 503, `autoSort` saves notes unsorted. With a key,
`autoSort: true` on note creation picks/creates a folder and writes tags
plus a summary; the chat endpoint manages notes through tool calls.
