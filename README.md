# Orbit - Social Media Platform

A social network with profiles, following, hashtags and mentions, threaded comments, bookmarks, notifications and search.

**Live demo (browser only, no server):** https://shishir19999.github.io/Social-Media-Platfrom/

**Stack:** React 19 + Vite 8 (`Frontend/`), Express 5 + Mongoose 9 + Multer + JWT + bcryptjs (`Backend/`), MongoDB. Node.js 24 LTS.

## Features
- Profiles with avatar, bio, cover image and a post grid; edit your own profile
- Follow / unfollow; a **Following** feed and an **Explore** feed
- Posts with up to 6 images and a lightbox; composer with draft autosave and a character counter
- Clickable `#hashtags` and `@mentions`; trending hashtags sidebar; tag pages
- Comment threads with replies and likes
- Likes, bookmarks / saved posts, share (copy link), edit / delete own posts, hide and report other posts
- Notifications panel and page (likes, comments, replies, mentions, follows)
- Search across people, posts and hashtags; infinite scroll
- Light / dark theme (follows the system, remembered), responsive from 320px, keyboard accessible, skeleton / empty / error states with retry, toasts and confirm dialogs
- Landing and Explore headers and the profile cover use a subtle parallax and scroll-reveal (transform / opacity only, `IntersectionObserver` + `requestAnimationFrame`, no libraries). It is switched off for `prefers-reduced-motion`, small screens (under 720px), data-saver and low-power devices, and is never applied inside the post feed.

## Run the full stack (real mode)
```bash
# Backend (needs MongoDB, default mongodb://localhost:27017)
cd Backend
cp .env.example .env     # set JWT_SECRET (required)
npm install
npm start                # or: npm run dev

# Frontend
cd Frontend
cp .env.example .env     # VITE_API_URL=http://localhost:5000
npm install
npm run dev
```
Optional seed data: `npm run seed` in `Backend` (idempotent) creates users with password `Password123!` (local demo data only) and about 100 posts.

## Run the browser-only demo
The demo swaps the server layer for an in-browser backend (same interface). Seeded users, posts and comments live in `localStorage`; uploaded images are downsized and stored as data URLs; no network requests are made. The app shows a "Demo mode" banner with a **Reset demo data** button.
```bash
cd Frontend
npm run dev:demo         # dev server with the demo backend
npm run build:pages      # static build for GitHub Pages -> Frontend/dist (base /Social-Media-Platfrom/, hash routing)
npm run preview:pages    # preview the Pages build
```
Demo logins (shown on the login page, password `Password123!`): `alice` (follows people, has notifications and saved posts) and `marcus`. You can also register your own account.

## Environment variables
- Backend: `JWT_SECRET` (**required**), `PORT` (default 5000), `MONGODB_URI` (default `mongodb://localhost:27017/socialMediaDB`), `CORS_ORIGIN`, `HOST`.
- Frontend: `VITE_API_URL` (default `http://localhost:5000`), `VITE_DEMO=true` to use the in-browser demo backend.

## API
Protected routes need `Authorization: Bearer <token>`. Lists are paginated (`page`, `limit`).

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Accounts (`logout` revokes the user's tokens) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/feed?scope=following\|explore&tag=&author=&saved=1` | Feed |
| GET / POST / PUT / DELETE | `/api/posts`, `/api/posts/:id` | Read, create (multipart `content`, `images[]`), edit, delete |
| POST | `/api/posts/:id/like`, `/bookmark`, `/hide`, `/report` | Per-viewer actions |
| GET / POST | `/api/posts/:id/comments` | Comment thread, add comment or reply (`parentId`) |
| DELETE / POST | `/api/posts/:id/comments/:cid`, `.../like` | Delete (cascades to replies), like |
| GET / PUT | `/api/users/:username`, `/api/users/me` | Profile, update (avatar / cover uploads) |
| POST | `/api/users/:username/follow` | Toggle follow |
| GET | `/api/users/suggestions`, `/api/trending`, `/api/search?q=` | Discovery |
| GET / POST | `/api/notifications`, `/api/notifications/read` | Notifications |
| GET | `/uploads/:file` | Uploaded files (git-ignored, `Backend/uploads/`) |

Uploads accept JPG, PNG and WebP; the type is verified from the file content, not only the mimetype. Older posts created before the accounts version are incompatible; clear the `posts` collection before use.

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
