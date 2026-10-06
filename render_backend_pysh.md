# Move Local Backend to Render

## Goal

The React Native Android APK currently communicates successfully with the backend running on the local Windows PC.

Move the backend from the local PC to **Render** so the Android app can access it over HTTPS from anywhere.

Current:

```text
Android APK
     ↓
Local Wi-Fi
     ↓
Windows PC
     ↓
Node.js Backend
     ↓
Playwright
     ↓
External websites / FunButler
```

Target:

```text
Android APK
     ↓
HTTPS
     ↓
Render
     ↓
Node.js Backend
     ↓
Playwright
     ↓
External websites / FunButler
```

The backend must continue working exactly as it does locally.

---

# 1. Before deploying

Confirm the local backend currently works.

Test:

```text
GET /api/health
```

Expected:

```json
{
  "status": "ok"
}
```

Also confirm the actual service endpoints work locally.

Do not deploy until the local version works reliably.

---

# 2. Git repository

The backend should be stored in a Git repository.

Recommended structure:

```text
backend/
├── src/
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env
├── .env.example
├── .gitignore
└── README.md
```

The `.env` file MUST NOT be committed.

---

# 3. Gitignore

Make sure `.gitignore` contains:

```gitignore
node_modules/
.env
.env.*
!.env.example
playwright/.auth/
dist/
```

The important rule is:

```text
.env
```

Never commit the actual credentials to GitHub.

---

# 4. Environment example

Create or maintain:

```text
.env.example
```

Example:

```env
PORT=3000

SERVICE_A_USERNAME=
SERVICE_A_PASSWORD=

SERVICE_B_USERNAME=
SERVICE_B_PASSWORD=

FUNBUTLER_USERNAME=
FUNBUTLER_PASSWORD=
```

Do not put real passwords in this file.

---

# 5. Render Web Service

Create a new **Web Service** on Render.

Connect the GitHub repository containing the backend.

Do not deploy the React Native project as the backend.

The Render service should point to the backend repository/directory.

If the repository contains both frontend and backend, configure Render's root directory appropriately.

---

# 6. Node.js build configuration

Use the existing `package.json` scripts where possible.

Example:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

Render configuration:

### Build Command

```bash
npm install && npm run build
```

### Start Command

```bash
npm start
```

Do not use:

```bash
npm run dev
```

as the production Render start command.

---

# 7. Render port configuration

The backend must use Render's assigned `PORT`.

Do NOT hard-code:

```ts
app.listen(3000);
```

Use:

```ts
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
```

The `"0.0.0.0"` binding is important because Render needs to be able to reach the server.

---

# 8. Environment variables on Render

Do NOT upload the local `.env`.

Instead, open the Render service's environment-variable settings and add the variables manually.

For example:

```text
PORT
SERVICE_A_USERNAME
SERVICE_A_PASSWORD
SERVICE_B_USERNAME
SERVICE_B_PASSWORD
FUNBUTLER_USERNAME
FUNBUTLER_PASSWORD
```

Use the actual values from the local `.env`.

The credentials must remain server-side.

The React Native application must never receive them.

---

# 9. Playwright configuration

The backend uses Playwright, so Render must be able to run Chromium.

Ensure Playwright is installed as a project dependency:

```bash
npm install playwright
```

Do not depend on a browser installation that only exists on the Windows development PC.

The Render deployment must install the required Playwright browser/runtime.

If the deployment fails with an error similar to:

```text
Executable doesn't exist
```

or:

```text
browserType.launch:
Executable doesn't exist
```

configure the Render build to install Chromium/Playwright browsers.

For example, the build process may need:

```bash
npm install && npx playwright install chromium && npm run build
```

Use the appropriate Render environment/dependencies if Chromium requires additional system packages.

Test the actual Playwright login after deployment.

---

# 10. Health endpoint

Keep the health endpoint:

```text
GET /api/health
```

Example:

```json
{
  "status": "ok"
}
```

After Render deploys, test:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

Expected:

```json
{
  "status": "ok"
}
```

Do not move on until this works.

---

# 11. Test the actual backend

After `/api/health` works, test the actual endpoints.

For example:

```text
GET /api/dashboard
```

and:

```text
GET /api/bookings?date=2026-10-06
```

The backend should:

```text
Render
  ↓
Node.js
  ↓
Playwright
  ↓
External website
  ↓
Extract data
  ↓
Return JSON
```

Do not expose credentials, cookies, or authentication tokens in API responses.

---

# 12. Important: CORS

The backend will eventually be accessed by:

```text
Android
iPhone
Web
```

Configure CORS appropriately.

During initial testing, it can be permissive:

```ts
app.use(cors());
```

Later, restrict it to the actual web frontend domain if necessary.

Native Android/iOS requests do not have the same browser-origin restrictions as a normal web browser.

---

# 13. Change the React Native API URL

The APK currently probably uses something like:

```ts
const API_URL = "http://192.168.1.50:3000";
```

Replace it with the Render HTTPS URL:

```ts
const API_URL = "https://YOUR-SERVICE.onrender.com";
```

Do not keep the local IP in the production build.

---

# 14. Centralize the API URL

The API URL should exist in one place.

For example:

```text
src/config/api.ts
```

```ts
export const API_URL =
  "https://YOUR-SERVICE.onrender.com";
```

Do not scatter the Render URL throughout the application.

This will make future changes easier.

---

# 15. Better: use environment configuration

Eventually configure separate development and production environments.

Development:

```text
http://192.168.1.50:3000
```

Production:

```text
https://YOUR-SERVICE.onrender.com
```

The production APK must use HTTPS.

Do not use HTTP for the production API.

---

# 16. Build a new APK

After changing the API URL, create a new APK:

```bash
eas build --platform android --profile preview
```

Download and install the new APK.

Because the application ID and signing credentials remain the same, Android should treat it as an update rather than a completely different application.

---

# 17. Test from mobile data

This is important.

Turn off Wi-Fi on the Android phone.

Use:

```text
4G / 5G
```

Then open the application.

The expected flow is:

```text
📱 Android
     │
     │ 4G / 5G
     ▼
☁️ Render
     │
     ▼
Node Backend
     │
     ▼
Playwright
     │
     ▼
External services
```

If the app works with Wi-Fi turned off, the backend migration is successful.

---

# 18. Verify credentials remain private

The APK should only contain something similar to:

```text
https://YOUR-SERVICE.onrender.com
```

It must NOT contain:

```text
SERVICE_A_USERNAME
SERVICE_A_PASSWORD
SERVICE_B_USERNAME
SERVICE_B_PASSWORD
FUNBUTLER_USERNAME
FUNBUTLER_PASSWORD
```

Those values must remain inside Render's environment variables.

---

# 19. Do not expose the scraper directly

The mobile app should request your API:

```text
GET /api/bookings
```

It should NOT:

```text
❌ Login directly to FunButler
❌ Login directly to Service A
❌ Login directly to Service B
❌ Store website passwords
❌ Scrape websites from the phone
```

The backend handles all external authentication and scraping.

---

# 20. Recommended caching

Do not make every mobile refresh trigger a complete Playwright session.

Use server-side caching.

Example:

```text
Android requests dashboard
        ↓
Is cached data recent?
        │
    YES │
        ▼
Return cached JSON

    NO
        ↓
Run Playwright
        ↓
Fetch latest data
        ↓
Update cache
        ↓
Return JSON
```

This will reduce:

- Browser launches
- Login attempts
- Website requests
- Render CPU usage
- Response time

---

# 21. Render sleep/cold-start consideration

If using a Render plan that allows the service to sleep, the first request after sleeping may take longer.

The application should therefore handle a slower first request gracefully.

Show something like:

```text
Connecting...
```

rather than assuming the API will respond instantly.

Do not make the app crash because the first backend request takes longer than usual.

---

# 22. Final architecture

The completed system should look like:

```text
                         INTERNET
                            │
                            │ HTTPS
                            ▼
                    ┌───────────────┐
                    │ React Native  │
                    │ Android       │
                    └───────┬───────┘
                            │
                            │
                    ┌───────▼───────┐
                    │    RENDER     │
                    │               │
                    │ Node.js       │
                    │ REST API      │
                    │ Playwright    │
                    │ Cache         │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Website A      Website B     FunButler
```

Later:

```text
                    ┌──────────────┐
                    │ React Native │
                    │              │
                    │ Android      │
                    │ iOS          │
                    │ Web          │
                    └──────┬───────┘
                           │
                           ▼
                    Render Backend
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Website A     Website B    FunButler
```

---

# 23. Deployment checklist

Before considering the migration complete:

- [ ] Backend works locally
- [ ] `.env` is ignored by Git
- [ ] No credentials are committed to GitHub
- [ ] Render Web Service created
- [ ] Build command configured
- [ ] Start command configured
- [ ] Render environment variables configured
- [ ] Server listens on `process.env.PORT`
- [ ] Server listens on `0.0.0.0`
- [ ] Playwright/Chromium works on Render
- [ ] `/api/health` works
- [ ] Website A works
- [ ] Website B works
- [ ] FunButler works
- [ ] React Native API URL changed to Render
- [ ] New APK built
- [ ] APK works on Wi-Fi
- [ ] APK works on 4G/5G
- [ ] Credentials are not present in APK
- [ ] Existing app data remains intact
- [ ] Backend errors are handled gracefully

---

# End state

The Windows PC no longer needs to be running.

The Android app can be anywhere with an internet connection:

```text
📱 Android
     │
     │ HTTPS
     ▼
☁️ Render
     │
     ├── Playwright
     ├── Website A
     ├── Website B
     └── FunButler
```

The local development backend can remain available for future development, while the production APK uses the Render backend.