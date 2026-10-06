# Social Media Platform

A small social feed with user accounts: register/login, create posts (title, content, optional JPG/PNG/PDF attachment), edit/delete your own posts, like (toggle) and comment.

**Stack:** React 19 + Vite 8 (Frontend), Express 5 + Mongoose 9 + Multer + JWT + bcryptjs (Backend), MongoDB.

Requires Node.js 24 LTS (Docker images: node:24, nginx:1.30, mongo:8.0).

## Setup
```bash
# Backend
cd Backend
cp .env.example .env     # set JWT_SECRET (required)
npm install
npm start                # or: npm run dev

# Frontend
cd Frontend
cp .env.example .env
npm install
npm run dev
```

## Seed demo data
`npm run seed` in `Backend` (idempotent, uses `MONGODB_URI`) creates users `admin@example.com`, `user@example.com`, `alice@example.com`
(usernames admin/user/alice), all with password `Password123!` (local demo data only), plus 22 more generated users (`<username>@example.com`, same password) and 100 posts in total, backdated over ~120 days, each with per-user likes and 0-8 comments from seeded users (no uploads). Uses `@faker-js/faker` with a fixed seed, so re-running changes nothing.

## Environment variables
- Backend: `JWT_SECRET` (**required**, server exits without it), `PORT` (default 5000), `MONGODB_URI` (default `mongodb://localhost:27017/socialMediaDB`).
- Frontend: `VITE_API_URL` (default `http://localhost:5000`).

## API
Protected routes need `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{ username, email, password }` (username/email unique, password min 6) returns `{ token, user }` |
| POST | `/api/auth/login` | no | `{ identifier (email or username), password }` returns `{ token, user }` |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/posts?page=1&limit=10` | no | Paginated feed (newest first): `{ posts, page, limit, total, pages }` |
| POST | `/api/posts` | yes | Create post (multipart: `title`, `content`, optional `file`, max 10MB) |
| PUT | `/api/posts/:postId` | owner | Edit `title`/`content`, optional replacement `file` (old file removed) |
| DELETE | `/api/posts/:postId` | owner | Delete post and its uploaded file |
| POST | `/api/posts/like/:postId` | yes | Toggle like for the current user |
| POST | `/api/posts/comment/:postId` | yes | Comment `{ text }`, author recorded |
| GET | `/uploads/:file` | no | Uploaded files |

Uploads are stored in `Backend/uploads/` (created automatically) and are git-ignored.

## Upgrading from the pre-accounts version
Posts created before accounts have no author and numeric `likes`. They are incompatible with the new schema; clear the `posts` collection (or migrate it) before use.


## Deploy with Docker

Files: `Backend/Dockerfile`, `Frontend/Dockerfile` (Vite build served by nginx, SPA fallback in `Frontend/nginx.conf`), `.dockerignore` in both folders and `docker-compose.yml` here (mongo + backend + frontend).

```bash
cp .env.example .env      # optional: set JWT_SECRET
docker compose up --build -d
```

- Frontend: http://localhost:8081 (`FRONTEND_PORT`), API: http://localhost:5000 (`BACKEND_PORT`). MongoDB is only reachable inside the compose network and its data lives in the `mongo-data` volume.
- `VITE_API_URL` is baked into the frontend bundle at build time and must be the address the **browser** uses to reach the backend (for a server: `http://<server-ip-or-domain>:5000`); rebuild with `docker compose build frontend` after changing it.
- `CORS_ORIGIN` must contain the origin the browser loads the frontend from (default `http://localhost:8081`); for a server use e.g. `http://<server-ip>:8081`.
- Seed demo data: `docker compose exec backend npm run seed` fails in the production image because the seed uses a dev dependency (`@faker-js/faker`); run the seed from your machine instead: `cd Backend && MONGODB_URL=mongodb://127.0.0.1:27017/socialMediaDB npm run seed` after temporarily publishing mongo (add `ports: ["27017:27017"]` to the `mongo` service).
- Uploaded files are stored in the `uploads` volume (`UPLOADS_DIR=/data/uploads`).

> Note: these Docker files were written and reviewed but not built or run in the authoring environment (Docker engine was off).

## Open the app from a phone on the same Wi-Fi

1. Find the PC's LAN IP (`ipconfig` on Windows, look for the IPv4 address, e.g. `192.168.1.79`).
2. Start the backend bound to all interfaces (the default `HOST=0.0.0.0`) with the phone's origin allowed, and Vite with `--host`:
   ```bash
   # Backend
   CORS_ORIGIN=http://localhost:5173,http://192.168.1.79:5173 npm start
   # Frontend: the API URL must use the LAN IP, not localhost
   VITE_API_URL=http://192.168.1.79:5000 npm run dev -- --host 0.0.0.0 --port 5173
   ```
   (PowerShell: `$env:CORS_ORIGIN="..."; npm start`.)
3. Allow the two ports through Windows Firewall (first run usually prompts; otherwise add an inbound rule for TCP 5000 and 5173, "Private" network only).
4. On the phone (same network) open `http://192.168.1.79:5173`.

Without `CORS_ORIGIN` set the API accepts any origin. If the phone shows the page but API calls fail, `VITE_API_URL` still points at `localhost` or the origin is missing from `CORS_ORIGIN`.

## Tests

`cd Backend && npm test` (node:test + supertest) runs against a throwaway local database that is dropped afterwards (set `TEST_MONGO_URI` to change the server, default `mongodb://127.0.0.1:27017`).

## Logout, uploads
- `POST /api/auth/logout` (Bearer) bumps `tokenVersion`, revoking all earlier tokens of that user; tokens of deleted users are rejected too. The Logout button calls it.
- Allowed uploads are JPG, PNG, WebP and PDF. The type is verified from the file content (magic numbers), not only the browser-supplied mimetype (some browsers send `application/octet-stream` for `.webp`). `UPLOADS_DIR` overrides the upload folder (default `Backend/uploads`).
