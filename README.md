# ExamOS — Backend (Express + MongoDB)

## Setup

```bash
cd backend
npm install
cp .env.example .env      # then fill in real secrets
npm run dev                # starts on http://localhost:5000
```

No seed scripts or demo data — all data comes straight from MongoDB (create users
via the app's signup, or insert directly into the database).

Requires a running MongoDB instance — either local (`mongodb://127.0.0.1:27017/examos`)
or a connection string from MongoDB Atlas in `MONGO_URI`.

## What's implemented

- **Auth**: register/login, JWT access token (15m) + httpOnly refresh cookie (7d),
  logout / logout-all-devices (refresh token versioning), role-based middleware.
- **Question Bank**: CRUD, filter/search (subject/topic/difficulty/tag/text),
  draft → in_review → approved/rejected workflow, version snapshots on edits
  to approved questions.
- **Test Builder**: sections with independent timing/shuffle rules, publish/
  unpublish, clone.
- **CBT Engine**: start/resume attempt, autosave per question, server-authoritative
  countdown timer (survives refresh and disconnects — remaining time is always
  derived from `startedAt`, never trusted from the client), submit + scoring
  with negative marking.
- **Analytics**: rule-based (no LLM) — topic-wise accuracy/speed, exam-readiness
  score, consistency score, deterministic recommendations, spaced-repetition
  revision queue (Day 1/3/7/15/30).
- **Bookmarks**, **audit log model**, security middleware (helmet, CORS,
  rate limiting, mongo-sanitize, xss-clean), centralized error handling.

## Deliberately NOT fully built yet (see root README "Roadmap")

- DOCX/PDF/Excel question parser (the spec's "Question Parser" module) —
  the Question model, staging-before-commit workflow, and version history
  are ready for it; the actual file-parsing pipeline is not implemented.
- Admin panel UI (this repo's `frontend` covers the student-facing app only).
- BullMQ background jobs (revision-queue promotion, notifications) — the
  `RevisionQueue` collection and `dueAt` field are ready for a worker to
  consume; no worker process is included yet.
- Socket.io is wired up (`server.js`) but only a `join` handshake exists —
  no feature currently emits over it.

## Project structure

```
src/
  config/       env + MongoDB connection
  models/       Mongoose schemas (one file per bounded concept)
  middleware/   auth, authorize, validate, security, rate limiting, errors
  validators/   Zod schemas per feature
  controllers/  business logic
  routes/       thin route -> middleware -> controller wiring
```
