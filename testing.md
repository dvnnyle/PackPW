# React Native → Real Android APK Local Testing

## Goal

Build a **real standalone Android `.apk`** from the React Native app.

The APK should:

1. Install directly on an Android phone.
2. Run without Expo Go.
3. Connect to the local backend running on the development PC.
4. Receive data from the backend.
5. Eventually be able to switch from the local backend to a Render backend.

Current architecture:

```text
Android APK
     │
     │ HTTP
     ▼
Windows PC
     │
     ▼
Local Node.js Backend
     │
     ├── Website A
     ├── Website B
     └── FunButler
```

Do NOT deploy the backend to Render yet.

---

# 1. Determine the React Native setup

First determine whether the project uses:

- Expo
- Expo Router
- React Native CLI

Check `package.json`.

If it contains:

```json
"expo": "..."
```

then it is an Expo project.

For this project, prefer **Expo + EAS Build** because the development machine is Windows and we eventually need iOS as well.

---

# 2. Install EAS CLI

On Windows, open PowerShell or the VS Code terminal:

```bash
npm install -g eas-cli
```

Check installation:

```bash
eas --version
```

---

# 3. Log into Expo

Run:

```bash
eas login
```

Use the Expo account associated with the project.

If an Expo account does not exist, create one.

---

# 4. Configure EAS

From the root of the React Native project:

```bash
eas build:configure
```

This should create:

```text
eas.json
```

Do not remove existing project configuration.

---

# 5. Configure an APK build

The project needs a preview/development build that produces an actual `.apk`.

Example:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

If an `eas.json` already exists, preserve its existing settings and add/update the preview profile instead of replacing unrelated configuration.

The important setting is:

```json
"buildType": "apk"
```

Do NOT use an Android App Bundle (`.aab`) for this first private installation test.

We specifically want:

```text
.apk
```

---

# 6. Set the Android application ID

The app needs a unique Android package/application ID.

For example:

```text
com.yourname.privateapp
```

If using Expo configuration, this can be configured in `app.json` or `app.config.ts`.

Example:

```json
{
  "expo": {
    "android": {
      "package": "com.yourname.privateapp"
    }
  }
}
```

Use a stable ID.

Do not change it later unless there is a specific reason.

The application ID is important because Android uses it to identify the app when installing updates.

---

# 7. Configure the local backend URL

The Android phone cannot use:

```text
http://localhost:3000
```

because `localhost` from the Android app refers to the Android phone itself.

Find the Windows PC's local IPv4 address:

```powershell
ipconfig
```

Look for something like:

```text
IPv4 Address. . . . . . . . . . : 192.168.1.50
```

The exact address will be different on each network.

The React Native app should use:

```text
http://192.168.1.50:3000
```

instead of:

```text
http://localhost:3000
```

---

# 8. Make the backend listen on the network

The backend must not only listen on `localhost`.

Configure Express to listen on:

```text
0.0.0.0
```

For example:

```ts
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
```

This allows other devices on the local network to connect.

---

# 9. Test the backend from Windows

Start the backend:

```bash
npm run dev
```

Test:

```text
http://localhost:3000/api/health
```

Expected:

```json
{
  "status": "ok"
}
```

---

# 10. Test the backend from Android

Make sure the Android phone and Windows PC are connected to the same Wi-Fi network.

On the Android phone, open Chrome and visit:

```text
http://192.168.1.50:3000/api/health
```

Replace the IP with the actual Windows PC IP.

Expected:

```json
{
  "status": "ok"
}
```

If this does not work:

1. Confirm both devices are on the same Wi-Fi.
2. Confirm the backend is running.
3. Confirm Express is listening on `0.0.0.0`.
4. Check Windows Firewall.
5. Confirm the port is correct.

Do NOT continue to APK testing until this works.

---

# 11. Connect React Native to the backend

Create a centralized API configuration.

Example:

```ts
const API_URL = "http://192.168.1.50:3000";

export async function getHealth() {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error("Backend request failed");
  }

  return response.json();
}
```

Do not scatter the backend URL throughout the application.

Keep it in one configuration location so it can later be changed to:

```text
https://your-backend.onrender.com
```

---

# 12. Test the actual data endpoint

Once `/api/health` works, test the real backend.

For example:

```text
GET /api/dashboard
```

or:

```text
GET /api/bookings?date=2026-10-06
```

The flow should be:

```text
Android
   ↓
React Native
   ↓
GET /api/bookings
   ↓
Windows backend
   ↓
Playwright
   ↓
FunButler / Website
   ↓
Backend converts data to JSON
   ↓
Android
```

The Android app must NOT contain the external website credentials.

Credentials remain on the backend.

---

# 13. Build the real APK

Once the app works correctly:

```bash
eas build --platform android --profile preview
```

EAS will upload the project and build the APK remotely.

The terminal will provide a build URL.

Wait for the build to finish.

---

# 14. Download the APK

When the build finishes, download the `.apk`.

You can either:

### Directly on Android

Open the EAS build/download URL on the Android phone.

Download:

```text
your-app.apk
```

Then install it.

### Or through the PC

Download the APK to Windows and transfer it to the Android phone using:

- USB
- Google Drive
- OneDrive
- another file-transfer method

Then open the APK on Android.

---

# 15. Android security prompt

Because this APK is not coming from Google Play, Android may show an "Install unknown apps" warning.

Allow the browser/file manager you used to install the APK.

Then install the app.

The app should now appear normally on the Android home screen.

It is a real standalone application.

Expo Go is NOT required.

---

# 16. Test the standalone APK

After installation, test:

### App startup

```text
Does the app open?
```

### Backend

```text
Does the app reach the local backend?
```

### Authentication

```text
Does the backend successfully log into the external service?
```

### Data

```text
Does the app receive the expected JSON?
```

### FunButler

```text
Can the app display bookings?
```

### Error handling

Turn off the backend and verify that the app displays a useful error rather than crashing.

---

# 17. Do NOT put credentials in the APK

The architecture must remain:

```text
                  🔒 Credentials
                       │
                       ▼
                Local Backend
                       │
                  Playwright
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      Website A    Website B    FunButler
                       │
                       ▼
                     JSON
                       │
                       ▼
                 Android APK
```

The APK should only