# TheCarePal Shift Roster — FS-02

A small full-stack scheduling demo for care operations teams. Frontend: React + Vite. Backend: Node.js + Express. All patient and nurse records are invented synthetic demo data.

## Open in VS Code
Open this project folder (the one containing this README) with **File → Open Folder**. The app has two separate parts:

- **frontend/** — React user interface, weekly roster, attendance controls, payroll download.
- **backend/** — Express API, SQLite database, seed data, validation, conflict and coverage calculations.

## Run locally
Install Node.js 18+ first. In the VS Code terminal, open this project root and run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards /api calls to the Express server on port 4000. Check the API at http://localhost:4000/api/health. For separate terminals, use `npm run dev:backend` and `npm run dev:frontend`. Build the production frontend with `npm run build`; run the API with `npm start`.

## How the demo works
The Express API stores nurses, patients, shifts, leave and attendance timestamps in a local SQLite file at `backend/data/roster.sqlite`. The database is created and seeded automatically on first run. The React app loads the roster from `GET /api/roster`, then sends changes to the API; the backend writes each change to SQLite, so data remains after a restart. The SQLite file is local and is excluded from Git.

### Included assignment flows
- Switch between patient and nurse weekly calendars.
- Create, edit, and delete shifts.
- API rejects overlapping shifts for the same nurse; patient coverage gaps are calculated and shown.
- Nurse weekly hours are summarized and compared with a 48-hour limit; the UI asks before saving above the limit.
- Mark leave via the leave action; API returns available same-skill replacement suggestions.
- Check in and check out; API stores ISO timestamps.
- Download weekly payroll hours as CSV.
- Mark a shift as a weekly recurring roster template.
- Shift edits display a demo notification in the UI. Real SMS/push notifications need a provider integration.

## API routes
- `GET /api/roster` — seed data, shifts, leaves, conflicts, coverage gaps.
- `POST /api/shifts`, `PUT /api/shifts/:id`, `DELETE /api/shifts/:id` — shift management.
- `POST /api/shifts/:id/attendance` — `{ "action": "check-in" }` or `check-out`.
- `POST /api/leaves` — `{ "nurse": "asha", "day": 0 }`; returns skill-matched available replacements.
- `GET /api/payroll.csv` — downloadable weekly payroll summary.
- `GET /api/health` — API health check.

## Design decisions and next steps
The project is split by responsibility: the browser renders the interface; Express validates changes and calculates the roster state. SQLite keeps the demo local and persistent without requiring credentials. For production, consider Firestore transactions, authentication and role permissions, actual timezone-aware shift dates, stronger leave coverage validation, and a push/SMS notification provider.

## Explaining it in a short walkthrough
1. Show the weekly roster and switch between patient and nurse views.
2. Add or edit a shift; demonstrate a rejected nurse overlap and the coverage-gap banner.
3. Show nurse weekly hours and download the CSV.
4. Record attendance and explain the API timestamp fields.
5. Open `frontend/src/App.jsx` for UI/API calls, then `backend/index.js` for validation and endpoints.
6. Explain that SQLite persists the demo data locally and mention the production steps above.

## AI tools
OpenAI Codex assisted with scaffolding and implementation. Review and understand the code before presenting or submitting it.

## Share a public demo link
Deploy this as a Node web service that runs the root build command and starts the Express server. Express serves the built React app and API from one origin, so the deployed website uses one URL. For example, connect the project repository to Render and set:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

After deployment, share the service URL (for example, `https://your-service.onrender.com`). A free host may sleep when idle and may erase files on restart/deploy. To preserve the SQLite database, attach persistent storage and set `DB_PATH` to a file inside its mounted directory (for example `/var/data/roster.sqlite`). Persistent disks may require a paid hosting plan. Use only the included synthetic demo records in a public demo; this prototype has no sign-in or access control, so anyone who has the URL can view and modify the shared roster.
