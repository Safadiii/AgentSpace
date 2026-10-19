# Olympus — AI Agent Hub

A minimal, mythology-inspired **React + FastAPI** prototype built around an immersive Mount Olympus scene. No dashboard clutter on the main screen: discover the agents by hovering/clicking subtle symbols, then scroll down into a quiet operational view.

![Olympus mountain scene](frontend/public/olympus-bg.webp)

## Start the API (terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Start the UI (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173**.

If the API is offline, the UI still runs in a **local preview mode** using browser localStorage. Start the API, then refresh the page to switch to the SQLite-backed mode.

## Interactions

- **Scroll** to gently approach the temple and reveal the operational workspace.
- **Click the four small symbols** on the mountain to inspect Zeus, Athena, Hermes, or Hephaestus.
- **Click Zeus** or press **Cmd/Ctrl+K** to add a directive.
- **Assign an agent** or let Zeus select Athena (research), Hermes (writing), or Hephaestus (engineering) through simple routing rules.
- **Pause/resume** agents and **mark running tasks complete** from the UI. Queued tasks advance when the active task is completed.
- **Reload the page**: data stays in SQLite when the API is running, or in localStorage in preview mode.

## Architecture

```text
frontend/src/App.tsx        Scene, scroll behavior, agent UI and controls
frontend/src/styles.css     Layout, colors, motion and responsive rules
frontend/src/api.ts         Typed API client + offline preview fallback
frontend/src/types.ts       Shared frontend types
frontend/public/olympus-bg.webp  Original project image, optimized
backend/app/main.py         REST API and CORS
backend/app/store.py        SQLite-backed demo task management
```

## Example REST calls

```bash
curl http://localhost:8000/api/state
curl -X POST http://localhost:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Research agent orchestration architectures","agent_id":null}'
```

## Important boundary

**Tasks are not really executed by AI agents yet.** Creating a directive records it and routes it to an agent; a human marks it complete in the prototype. The API has no language model connections, scheduling/queue workers, authentication, or event-streaming. Replace the simple routing and task storage with your central orchestration/service layer when ready.

Integration points for a future orchestrator:

1. Replace `store.choose_agent` with your Zeus routing/planning service.
2. Add asynchronous execution jobs in your agent runtime whenever `create_task` is called.
3. Update task status from worker events instead of pressing `Mark complete` manually.
4. Connect each agent's run IDs, summaries, and stored recommendations to its detail view.
5. Add auth, tenant isolation, role-based access, and WebSocket/SSE events before production.

## Design choices

- Main hero: one optimized 143 KB image, one gentle zoom, no fixed sidebars, no floating info cards.
- UI appears on demand: hover labels and a dismissible glass drawer.
- Off-white operations section with light blue typography and understated status colors.
- Responsive viewport layouts and `prefers-reduced-motion` support.

Built as a starting point for the existing research-agent/central-OS project.
