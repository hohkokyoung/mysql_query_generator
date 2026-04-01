# mysql_query_agent

Natural language → MySQL query agent.
- Reads your schema from a local file
- Generates SQL via a local Ollama model
- Dry-runs the query with `BEGIN / ROLLBACK` — never commits
- Self-verifies the result, rewrites and retries if wrong

---

## Requirements

- Node.js 18+
- MySQL or MariaDB running locally
- Ollama running locally with a coding model pulled

---

## Setup

### 1. Install a coding model in Ollama

```bash
ollama pull qwen2.5-coder:14b   # recommended
# or
ollama pull deepseek-coder-v2
# or
ollama pull codellama:13b       # lighter option
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Start the backend

```bash
npm start
# or for auto-reload during dev:
npm run dev
```

Backend runs at `http://localhost:3333`.

### 4. Open the UI

Open `frontend/index.html` directly in your browser — no build step needed.

---

## Usage

1. **Schema** — paste the path to your `.sql` schema file (e.g. `/home/you/project/schema.sql`) and click **load schema**
2. **MySQL** — fill in host, port, database, user, password and click **test connection**
3. **Ollama** — confirm the URL is `http://localhost:11434`, click **refresh models** to populate the dropdown
4. Type your request in plain English and press **Enter** or **run**

---

## How the agent loop works

```
you: "show me all users who ordered over $100 last month"
       ↓
   ollama generates SQL
       ↓
   backend: BEGIN; execute sql; ROLLBACK   ← never commits
       ↓
   if error → ollama rewrites → retry
       ↓
   if ok → ollama self-verifies result logic
       ↓
   if wrong → ollama rewrites → retry
       ↓
   final SQL + result shown in terminal
```

Max retries is configurable (default: 3).

---

## Project structure

```
nl-sql-agent/
├── backend/
│   ├── server.js       ← Express API: schema read, db dryrun, ollama proxy
│   └── package.json
└── frontend/
    └── index.html      ← Single-file UI, talks to backend on :3333
```

---

## Notes

- The backend needs to be on the same machine as your DB and schema files
- Ollama must be running (`ollama serve`) before starting the backend
- Results are capped at 50 rows in dry-run mode
- Only SELECT / WITH / CALL queries are allowed — DROP, TRUNCATE, ALTER are blocked
