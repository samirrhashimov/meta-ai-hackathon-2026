# AI Notes — Frontend

Obsidian-style 3-pane UI built with React + Vite + Tailwind.

## Setup

```bash
cd frontend
npm install
```

## Run

The backend must run first (`npm run dev` in `backend/`, :5000).
Then in this folder:

```bash
npm run dev
```

Open in the browser: http://localhost:5173

If the backend lives elsewhere, create a `.env` file:

```
VITE_API_URL=http://localhost:5000
```

## Structure

- `src/api.js` — all backend calls in one place
- `src/components/Sidebar.jsx` — left: folder tree + note list + search
- `src/components/NoteEditor.jsx` — center: markdown write/preview + attachments
- `src/components/AiPanel.jsx` — AI chat (with tools) + quick note add
- `src/components/Dashboard.jsx` — stats, charts, AI overview
- `src/App.jsx` — state and layout
