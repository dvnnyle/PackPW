# Local Backend Setup

Build a local Node.js + TypeScript backend that collects data from multiple websites that do not provide public APIs.

The backend will eventually be deployed to Render and consumed by a React Native/Expo application for Android and iOS.

## Architecture

The intended architecture is:

```text
Website / Service A ──┐
                      │
Website / Service B ──┼── Playwright ── Backend ── REST API
                      │                       │
FunButler ────────────┘                       │
                                              ▼
                                      React Native App
                                      Android + iOS
```

For now, implement only the local backend.

The mobile application will be developed later.

---

# 1. Technology

Use:

- Node.js
- TypeScript
- Express
- Playwright
- dotenv
- CORS

The backend should run locally at:

```text
http://localhost:3000
```

---

# 2. Create the project

Create a new directory:

```bash
mkdir dashboard-backend
cd dashboard-backend
```

Initialize Node:

```bash
npm init -y
```

Install dependencies:

```bash
npm install express cors dotenv playwright
```

Install development dependencies:

```bash
npm install -D typescript tsx @types/node @types/express @types/cors
```

Install Playwright Chromium:

```bash
npx playwright install chromium
```

Initialize TypeScript:

```bash
npx tsc --init
```

---

# 3. Project structure

Use this structure:

```text
dashboard-backend/
│
├── src/
│   ├── server.ts
│   │
│   ├── routes/
│   │   ├── dashboard.ts
│   │   └── bookings.ts
│   │
│   ├── services/
│   │   ├── serviceA.ts
│   │   ├── serviceB.ts
│   │   └── funbutler.ts
│   │
│   ├── browser/
│   │   └── browser.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── cache/
│       └── cache.ts
│
├── .env
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

Each external website must have its own service module.

Do not mix the scraping logic directly into the Express routes.

---

# 4. Environment variables

Create:

```text
.env
```

Store website credentials there:

```text
SERVICE_A_USERNAME=
SERVICE_A_PASSWORD=

SERVICE_B_USERNAME=
SERVICE_B_PASSWORD=

FUNBUTLER_USERNAME=
FUNBUTLER_PASSWORD=
```

Never hard-code credentials into TypeScript files.

Never return these credentials through an API endpoint.

Create `.gitignore`:

```text
node_modules/
.env
playwright/.auth/
```

Also create `.env.example` containing only the variable names and no real credentials.

---

# 5. Express server

Create an Express server in:

```text
src/server.ts
```

Enable:

- JSON parsing
- CORS
- routes
- basic error handling

Add a health endpoint:

```text
GET /api/health
```

It should return:

```json
{
  "status": "ok"
}
```

Start the development server with:

```bash
npm run dev
```

Configure the script to use:

```bash
tsx watch src/server.ts
```

---

# 6. Playwright browser manager

Create:

```text
src/browser/browser.ts
```

This module should be responsible for creating Playwright browser instances.

During development, run Chromium with:

```ts
headless: false
```

This is important because I want to see what the automation is doing while developing it.

Later, production should support:

```ts
headless: true
```

through an environment variable.

Do not launch a completely unrelated browser implementation inside every route.

Keep browser creation and configuration centralized.

---

# 7. Service modules

Each website should have its own module.

For example:

```text
src/services/serviceA.ts
```

The module should:

1. Open the website.
2. Navigate to its login page.
3. Enter credentials from `.env`.
4. Submit the login form.
5. Confirm that authentication succeeded.
6. Navigate to the relevant page.
7. Wait for the required content.
8. Extract the required information.
9. Convert it into a clean JavaScript object.
10. Return that object.

Example conceptual result:

```json
{
  "orders": 18,
  "customers": 42,
  "revenue": 15420
}
```

The service should NOT return raw HTML to the mobile application.

---

# 8. FunButler

Create:

```text
src/services/funbutler.ts
```

FunButler does not provide a public API, so investigate how its booking interface retrieves data.

First inspect browser network traffic when changing dates.

Look for requests such as:

```text
/wp-admin/admin-ajax.php
```

or other:

```text
XHR
fetch
POST
JSON
```

requests.

If FunButler internally retrieves structured booking data, prefer using that data rather than parsing the rendered visual interface.

If no suitable internal request can be used, use Playwright DOM extraction.

The FunButler service should support requesting bookings for a particular date.

Conceptually:

```ts
getBookings(date)
```

For example:

```ts
getBookings("2026-10-05")
```

should return normalized data such as:

```json
{
  "date": "2026-10-05",
  "bookings": [
    {
      "time": "10:00",
      "name": "Birthday",
      "guests": 12
    },
    {
      "time": "13:30",
      "name": "Birthday",
      "guests": 18
    }
  ]
}
```

Do not use OCR or screenshots to retrieve text unless there is absolutely no alternative.

---

# 9. Booking API

Create:

```text
GET /api/bookings?date=2026-10-05
```

The route should call the FunButler service.

For example:

```text
React Native

GET /api/bookings?date=2026-10-05
             │
             ▼
        Express route
             │
             ▼
      FunButler service
             │
             ▼
        Playwright
             │
             ▼
        FunButler
             │
             ▼
          JSON
```

Validate the supplied date before sending it to the service.

---

# 10. Dashboard endpoint

Eventually create:

```text
GET /api/dashboard
```

This endpoint should combine information from the different services.

Example:

```json
{
  "updatedAt": "2026-10-05T18:20:00Z",
  "serviceA": {
    "orders": 18
  },
  "serviceB": {
    "status": "online"
  },
  "today": {
    "bookingCount": 14
  }
}
```

The React Native application should only need to communicate with this backend.

It should never need to know how Service A, Service B, or FunButler work internally.

---

# 11. Sessions

Avoid performing a complete username/password login for every API request if the website allows sessions to be reused.

Once the initial login works, investigate Playwright `storageState`.

The intended flow should eventually be:

```text
First run
   ↓
Login
   ↓
Save authenticated session
   ↓
Future request
   ↓
Reuse session
   ↓
Check if still authenticated
   │
   ├── YES → collect data
   │
   └── NO → login again
```

Do not commit saved authentication state to Git.

---

# 12. Caching

Do not scrape every website every time the mobile application refreshes.

Introduce a simple server-side cache.

For example:

```text
App requests dashboard
        ↓
Is cached data < 60 seconds old?
        │
      YES ──→ Return cached JSON
        │
       NO
        ↓
Fetch websites
        ↓
Update cache
        ↓
Return JSON
```

The cache duration should be configurable later.

---

# 13. Error handling

One failing service should not necessarily crash the entire backend.

Return useful errors such as:

```json
{
  "error": "Failed to retrieve FunButler bookings"
}
```

Log the underlying server-side error without exposing:

- passwords
- cookies
- authentication tokens
- session identifiers

to the API client.

---

# 14. First milestone

Do NOT build everything simultaneously.

The first milestone is simply:

```text
localhost:3000
      ↓
Express
      ↓
Playwright
      ↓
ONE website
      ↓
Login
      ↓
Extract ONE useful value
      ↓
Return JSON
```

For example:

```text
GET http://localhost:3000/api/test
```

returns:

```json
{
  "success": true,
  "value": "..."
}
```

Once this works reliably, implement the second service and FunButler.

Do not start the React Native application until this basic backend pipeline works.

---

# 15. Later production architecture

Once local development is stable, the intended production architecture is:

```text
                  INTERNET

Service A ──┐
            │
Service B ──┼── Playwright
            │       │
FunButler ──┘       ▼
                 Render
              Node Backend
                   │
              HTTPS REST API
                   │
            ┌──────┴──────┐
            ▼             ▼
        Android          iOS
            \             /
             React Native
                + Expo
```

The backend should therefore be written so that moving from localhost to Render requires minimal changes.

Configuration that differs between development and production should use environment variables rather than hard-coded values.