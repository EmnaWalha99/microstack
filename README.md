# microstack

A production-grade distributed systems bundle built from scratch with Node.js.
No frameworks doing the heavy lifting — every pattern implemented by hand.

---

## What is this?

Most backend tutorials show you how to build *one* thing.
This project builds the *infrastructure* that every serious backend runs on top of.

You get a fully working system with a custom load balancer, an API gateway with rate limiting, JWT authentication, a background job queue, and a file upload service — all wired together, all running in Docker, all deployable to Kubernetes.

This is not a tutorial project. This is the kind of architecture you find at companies like Stripe, Notion, or Linear.

---

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────┐
│       Load Balancer         │  :3000  ← single entry point
│   round-robin distribution  │
└────────────┬────────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌─────────┐      ┌─────────┐
│ Gateway │      │ Gateway │  :3001  ← 2 replicas
│  gw-1   │      │  gw-2   │
└────┬────┘      └────┬────┘
     └───────┬────────┘
             │  applies to every request:
             │  ├── rate limiter  (Redis sliding window)
             │  └── JWT auth      (on protected routes)
             │
    ┌────────┼──────────┐
    ▼        ▼          ▼
┌────────┐ ┌───────┐ ┌────────┐
│  Auth  │ │ Jobs  │ │ Files  │
│  :3002 │ │ :3003 │ │ :3004  │
└────────┘ └───┬───┘ └────────┘
               │
            ┌──┴──┐
            │Redis│  :6379
            └─────┘
```

---

## Services

### Load Balancer — port 3000
The only service exposed to the outside world. Every request enters here.

Implements two algorithms switchable via environment variable:
- **Round-robin** — distributes requests evenly across gateways in order
- **Least-connections** — always routes to whichever gateway is handling the fewest active requests

Runs a health check against every upstream every 10 seconds. If a gateway goes down, it's automatically removed from the rotation.

Key files:
```
services/load-balancer/
└── src/
    └── index.js    ← proxy logic, round-robin counter, health checks
```

---

### API Gateway — port 3001 (x2 replicas)
The brain of the system. Every request passes through two layers before reaching a service.

**Layer 1 — Rate Limiter** (`src/middleware/rateLimiter.js`)

Uses a Redis sorted set to implement a sliding window algorithm. Unlike a fixed window (which allows a burst at window boundaries), the sliding window is continuous — it looks at the last 60 seconds from *right now*, not from the start of the current minute.

How it works per request:
1. Remove all entries older than 60 seconds from the IP's sorted set
2. Count remaining entries
3. If count ≥ 100 → reject with HTTP 429
4. Otherwise → add this request and continue

Returns standard rate limit headers on every response:
- `X-RateLimit-Limit` — max requests allowed
- `X-RateLimit-Remaining` — requests left in window
- `X-RateLimit-Reset` — when the window resets

Fails open — if Redis is unreachable, requests are allowed through.

**Layer 2 — JWT Auth** (`src/middleware/auth.js`)

Verifies the Bearer token on protected routes. On success, injects the decoded user identity into downstream request headers so services don't need to re-verify:
- `x-user-id`
- `x-user-email`
- `x-user-role`

**Route table:**
```
/auth/*   →  auth-service       (public — no JWT required)
/jobs/*   →  job-queue-service  (protected)
/files/*  →  file-upload-service (protected)
```

Key files:
```
services/api-gateway/
└── src/
    ├── index.js
    └── middleware/
        ├── rateLimiter.js   ← Redis sliding window
        └── auth.js          ← JWT verification
```

---

### Auth Service — port 3002
Handles everything identity-related.

- `POST /register` — hashes password with bcrypt (12 rounds), stores user, returns access + refresh token
- `POST /login` — verifies password, returns tokens
- `POST /refresh` — validates refresh token, issues new access token (single-use rotation)

Token strategy:
- Access token: JWT, signed with HS256, expires in 15 minutes
- Refresh token: UUID v4, stored in memory, single-use (deleted on use, new one issued)

Key files:
```
services/auth-service/
└── src/
    ├── index.js
    └── routes/
        └── auth.js   ← register, login, refresh logic
```

---

### Job Queue Service — port 3003
Async job processing for dev tool workloads.

The core insight: never do slow work inside an HTTP request. A build takes 5 seconds — if you run it synchronously, the client waits 5 seconds and your gateway is blocked. Instead, you enqueue the job, return an ID immediately, and let the client poll for completion.

Built on BullMQ with Redis as the backend.

Supported job types:
| Type | Simulated duration | What it returns |
|---|---|---|
| `lint` | 1–3s | issue count, files checked |
| `format` | 0.5–1.5s | formatted files, style used |
| `build` | 2–5s | artifact name, bundle size |
| `test` | 1.5–4s | total/passed/failed suite counts |
| `deploy` | 3–7s | environment URL, deploy timestamp |

Features:
- Concurrency: 5 jobs processed simultaneously
- Retries: 3 attempts with exponential backoff (1s, 2s, 4s)
- Progress tracking: jobs report 0% → 50% → 100%

Endpoints:
- `POST /jobs` — enqueue, returns job ID instantly
- `GET /jobs` — list all jobs with status
- `GET /jobs/:id` — get single job status + result
- `DELETE /jobs/:id` — remove a job
- `POST /jobs/:id/retry` — retry a failed job

Key files:
```
services/job-queue-service/
└── src/
    ├── index.js
    ├── queue.js        ← BullMQ setup, worker, job processors
    └── routes/
        └── jobs.js     ← REST API
```

---

### File Upload Service — port 3004
Handles multipart file uploads with metadata tracking and ownership.

- `POST /upload` — accepts up to 5 files, validates MIME type, saves to disk, returns metadata
- `GET /files` — list your uploaded files
- `GET /files/:id` — get file metadata (add `?download=true` to stream the file)
- `DELETE /files/:id` — delete from disk and metadata store

Constraints:
- Max file size: 10MB per file
- Max files per request: 5
- Allowed types: images, PDFs, text, CSV, JSON, ZIP

Ownership: users can only see and delete their own files. Role `admin` can see all.

Key files:
```
services/file-upload-service/
└── src/
    ├── index.js
    └── routes/
        └── upload.js   ← multer config, all file routes
```

---

## Project Structure

```
microstack/
├── docker-compose.yml              ← local dev environment
├── .env.example                    ← copy to .env before running
├── k8s/                            ← Kubernetes manifests
│   ├── namespace.yaml
│   ├── config.yaml                 ← ConfigMap + Secret
│   ├── redis/
│   ├── load-balancer/
│   ├── api-gateway/                ← includes HPA (autoscaling)
│   ├── auth-service/
│   ├── job-queue-service/
│   └── file-upload-service/        ← includes PVC for uploads
└── services/
    ├── load-balancer/
    ├── api-gateway/
    ├── auth-service/
    ├── job-queue-service/
    └── file-upload-service/
```

---

## Running Locally

### Prerequisites
- Docker Desktop
- Node.js v20+

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/your-username/microstack
cd microstack

# 2. Set up environment
cp .env.example .env
# Open .env and change JWT_SECRET to something strong

# 3. Start everything
docker compose up --build

# 4. Verify all services are up
# You should see these lines in the logs:
# MS-redis            | Ready to accept connections
# MS-auth-service     | Auth service running on port 3002
# MS-file-upload-service | File Upload Service running on port 3004
# MS-job-queue        | Job Queue Service running on port 3003
# MS-api-gateway-1    | listening on port 3001
# MS-api-gateway-2    | listening on port 3001
# MS-load-balancer    | listenning..
```

---

## API Reference

All requests go through the load balancer on **port 3000**.

### Auth

**Register**
```
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "yourpassword"
}
```

**Login**
```
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "you@example.com",
  "password": "yourpassword"
}
```

**Refresh token**
```
POST http://localhost:3000/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<your-refresh-token>"
}
```

---

### Jobs (requires auth)

**Enqueue a job**
```
POST http://localhost:3000/jobs
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "type": "build",
  "data": { "project": "my-app" }
}
```

**Poll job status**
```
GET http://localhost:3000/jobs/<job-id>
Authorization: Bearer <accessToken>
```

**List all jobs**
```
GET http://localhost:3000/jobs
Authorization: Bearer <accessToken>
```

**Retry a failed job**
```
POST http://localhost:3000/jobs/<job-id>/retry
Authorization: Bearer <accessToken>
```

---

### Files (requires auth)

**Upload**
```
POST http://localhost:3000/files/upload
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file: <your file>
```

**List files**
```
GET http://localhost:3000/files
Authorization: Bearer <accessToken>
```

**Download**
```
GET http://localhost:3000/files/<file-id>?download=true
Authorization: Bearer <accessToken>
```

**Delete**
```
DELETE http://localhost:3000/files/<file-id>
Authorization: Bearer <accessToken>
```

---

### Load Balancer stats
```
GET http://localhost:3000/_lb/stats
```
Shows both upstreams, their health, active connections, and total requests served.

---

## Kubernetes Deploy

```bash
# Prerequisites: kubectl + a running cluster (minikube, kind, k3s, EKS...)

# 1. Build and tag images (minikube example)
eval $(minikube docker-env)

docker build -t sdb-load-balancer:latest        services/load-balancer
docker build -t sdb-api-gateway:latest          services/api-gateway
docker build -t sdb-auth-service:latest         services/auth-service
docker build -t sdb-job-queue-service:latest    services/job-queue-service
docker build -t sdb-file-upload-service:latest  services/file-upload-service

# 2. Apply manifests in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/redis/
kubectl apply -f k8s/auth-service/
kubectl apply -f k8s/job-queue-service/
kubectl apply -f k8s/file-upload-service/
kubectl apply -f k8s/api-gateway/
kubectl apply -f k8s/load-balancer/

# 3. Watch pods come up
kubectl get pods -n system-design -w

# 4. Get the load balancer URL
minikube service load-balancer -n system-design --url
```

The API Gateway is configured with a Horizontal Pod Autoscaler — it scales from 2 to 8 replicas automatically when CPU exceeds 60% or memory exceeds 70%.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `supersecretkey` | Sign/verify access tokens — **change this** |
| `JWT_REFRESH_SECRET` | `refresh_supersecretkey` | Sign/verify refresh tokens — **change this** |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `LB_ALGORITHM` | `round-robin` | `round-robin` or `least-connections` |
| `MAX_FILE_SIZE_MB` | `10` | Max upload size in MB |
| `UPLOAD_DIR` | `./uploads` | Where files are stored on disk |

---

## What to swap for production

| Current | Production replacement |
|---|---|
| In-memory user store (`Map`) | PostgreSQL / MongoDB |
| In-memory file metadata (`Map`) | PostgreSQL / MongoDB |
| Disk file storage | AWS S3 / GCS (`multer-s3`) |
| Single Redis instance | Redis Cluster or Redis Sentinel |
| `console.log` logging | Structured logging with Pino or Winston |
| No metrics | Prometheus + Grafana |
| No tracing | OpenTelemetry |

---

## What I learned building this

Every service in this project represents a real system design concept:

- **Load balancer** — how traffic is distributed and why stateless services enable horizontal scaling
- **API Gateway** — why a single entry point simplifies auth, rate limiting, and observability
- **Sliding window rate limiter** — why fixed windows have burst problems and how sorted sets solve it
- **JWT with refresh rotation** — why short-lived tokens reduce exposure and how rotation prevents replay attacks
- **Job queue** — why async processing is essential for any operation that takes more than ~200ms
- **Kubernetes HPA** — how production systems scale automatically under load without manual intervention
