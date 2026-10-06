# React Native Private APK Update System

## Goal

Implement an in-app update system for the private Android APK.

The app should:

1. Display the currently installed version.
2. Have a Settings page.
3. Have an **"Check for updates"** button.
4. Automatically check for updates when the app starts.
5. Show an update dialog when a newer version exists.
6. Download the new APK.
7. Open the Android package installer.
8. Allow the user to install the update without uninstalling the existing app.
9. Preserve all existing app data.
10. Support optional and mandatory updates.

This is for private APK distribution and does NOT use Google Play.

---

# 1. Architecture

Use this architecture:

```text
                 React Native APK
                       │
              ┌────────┴─────────┐
              │                  │
         App startup        Settings page
              │                  │
              └────────┬─────────┘
                       │
                       ▼
             GET /api/app-version
                       │
                       ▼
                Backend / Render
                       │
                       ▼
                Version metadata
                       │
              ┌────────┴─────────┐
              │                  │
         Same version       New version
              │                  │
              ▼                  ▼
          Do nothing        Show update UI
                                 │
                                 ▼
                           Download APK
                                 │
                                 ▼
                       Android Package Installer
                                 │
                                 ▼
                           Install update
```

---

# 2. Backend update endpoint

Create:

```text
GET /api/app-version
```

It should return:

```json
{
  "version": "1.0.4",
  "versionCode": 4,
  "apkUrl": "https://your-download-location/app-1.0.4.apk",
  "mandatory": false,
  "releaseNotes": [
    "Improved booking display",
    "Fixed dashboard refresh",
    "Minor bug fixes"
  ]
}
```

Use `versionCode` for the actual comparison.

Use `version` for displaying the human-readable version.

Example:

```text
version:     1.0.4
versionCode: 4
```

The version code must increase with every released Android build:

```text
1.0.0 → 1
1.0.1 → 2
1.0.2 → 3
1.0.3 → 4
1.0.4 → 5
```

Never reuse an old version code.

---

# 3. APK hosting

Do not make the React Native app guess where the APK is located.

The backend response should provide the current APK URL:

```json
{
  "version": "1.0.4",
  "versionCode": 5,
  "apkUrl": "https://example.com/app.apk"
}
```

The APK itself should be hosted somewhere accessible over HTTPS.

The URL must point to the actual APK file.

Eventually use a proper release/download location rather than relying on the local development machine.

---

# 4. Android application ID

Keep the Android application/package ID permanently stable.

For example:

```text
com.yourcompany.privateapp
```

Do NOT change this between releases.

Android uses this ID to determine that the new APK is an update of the existing application.

---

# 5. Android signing key

All released APKs must be signed with the same Android signing identity.

This is extremely important.

The update will only work as an update if the new APK has:

```text
Same application ID
+
Same signing key
+
Higher versionCode
```

Do not generate a new signing key for every release.

EAS should manage the Android signing credentials consistently.

Do not delete or reset the EAS Android credentials once the app is in use.

---

# 6. Get installed app version

Use the installed application's version information rather than hard-coding it.

If using Expo, use:

```bash
npx expo install expo-application
```

Then retrieve:

```ts
import * as Application from "expo-application";

const version = Application.nativeApplicationVersion;
const versionCode = Application.nativeBuildVersion;
```

Example:

```text
Installed version:
1.0.3

Installed versionCode:
4
```

Convert `nativeBuildVersion` to a number before comparing.

---

# 7. Version checking service

Create something similar to:

```text
src/services/updateService.ts
```

This module should:

1. Get the installed version.
2. Request `/api/app-version`.
3. Compare the installed `versionCode` with the server's `versionCode`.
4. Return whether an update exists.
5. Return the update metadata.

Example result:

```ts
{
  updateAvailable: true,
  version: "1.0.4",
  versionCode: 5,
  apkUrl: "...",
  mandatory: false,
  releaseNotes: [...]
}
```

Comparison should be:

```ts
latestVersionCode > installedVersionCode
```

Do NOT compare version strings such as:

```ts
"1.0.10" > "1.0.9"
```

because string comparison can produce incorrect results.

---

# 8. Settings page

Create a Settings screen.

Example:

```text
SETTINGS

App
────────────────────────

Version
1.0.3

Updates
Check for updates                  >

────────────────────────

About
...
```

When the user taps:

```text
Check for updates
```

perform the update check.

---

# 9. No update

If the app is already current, show something simple:

```text
You're up to date

Version 1.0.4
```

Do not display an unnecessary update screen.

---

# 10. Update available

If an update exists, display:

```text
Update available

Version 1.0.4

What's new:
• Improved bookings
• Fixed dashboard issue
• Performance improvements

[ Update now ]
[ Later ]
```

For a mandatory update:

```text
Update required

Version 1.0.4 is required to continue.

What's new:
• Fixed backend compatibility

[ Update now ]
```

Do not provide a "Later" button for mandatory updates.

---

# 11. Automatic update check

Also check for updates when the app starts.

Do NOT block the app while checking.

Use:

```text
App opens
   ↓
Show application normally
   ↓
Check for update in background
   ↓
If update exists
   ↓
Show update dialog
```

The user should not stare at a loading screen just because the update server is unavailable.

If the update server cannot be reached:

```text
Continue normally
```

Do not crash the application.

---

# 12. Prevent excessive checking

Do not request `/api/app-version` continuously.

Recommended:

### On app launch

Check once.

### Settings

Allow manual:

```text
Check for updates
```

### Optional

Cache the last successful check for a short period, such as 30–60 minutes.

This prevents unnecessary requests.

---

# 13. Download the APK

When the user presses:

```text
Update now
```

download the APK from:

```text
apkUrl
```

Use an HTTPS URL.

Show progress if possible:

```text
Downloading update...

████████████░░░░ 78%
```

Do not delete the currently installed app.

The new APK should be downloaded separately.

---

# 14. Open Android's installer

After downloading the APK, launch the Android package installer.

The expected flow is:

```text
React Native
     ↓
Download APK
     ↓
Open APK
     ↓
Android installer
     ↓
"Do you want to update this app?"
     ↓
Install
```

The user confirms the installation.

The app itself does not silently replace its own APK.

Android controls the final installation.

---

# 15. Unknown app installation permission

Because this APK is not distributed through Google Play, Android may require permission for the application that initiated the APK installation.

Handle this gracefully.

If the user has not granted the required permission:

```text
Installation permission required

Android needs permission to install updates from this app.

[ Open settings ]
```

After the user enables the permission, allow them to retry the update.

---

# 16. Preserve application data

The update must NOT uninstall the existing application.

Android should perform an application upgrade.

Existing:

```text
App v1.0.3
```

becomes:

```text
App v1.0.4
```

while retaining application data.

Do not use an uninstall/reinstall workflow.

---

# 17. Release process

Every time a new version is released:

### 1. Update the app version

Example:

```text
1.0.3 → 1.0.4
```

### 2. Increase Android version code

Example:

```text
4 → 5
```

### 3. Build the APK

```bash
eas build --platform android --profile preview
```

### 4. Upload the APK

Put the new APK at the configured release/download location.

### 5. Update backend metadata

Change:

```json
{
  "version": "1.0.4",
  "versionCode": 5,
  "apkUrl": "https://example.com/app-1.0.4.apk"
}
```

### 6. Test

Open the existing v1.0.3 app.

It should detect:

```text
Installed: 4
Latest:    5
```

and show:

```text
Update available
```

### 7. Install

Press:

```text
Update now
```

Android should install v1.0.4 over v1.0.3.

---

# 18. Important security considerations

The update URL must use HTTPS.

Do not allow the backend to return arbitrary URLs supplied by users.

The APK download location should be controlled by the application/backend.

Do not place website credentials in the React Native application.

The update API contains only public application metadata:

```text
version
versionCode
apkUrl
releaseNotes
mandatory
```

No passwords or external-service credentials should ever be returned.

---

# 19. Development vs production

During development, you can use:

```text
http://192.168.x.x:3000/api/app-version
```

Later:

```text
https://your-backend.onrender.com/api/app-version
```

Do not hard-code this URL throughout the app.

Put the API base URL in one configuration location.

---

# 20. Future iOS compatibility

Keep the update system separated from the Android-specific installation code.

The version checking logic can be shared:

```text
Check server
     ↓
New version?
     ↓
Yes
```

But installation is platform-specific.

Android:

```text
Download APK
↓
Android installer
```

iOS later:

```text
TestFlight / Apple distribution
```

Do not attempt to make the Android APK installation mechanism run on iOS.

---

# Final user experience

The finished Android app should feel like:

```text
┌─────────────────────────────┐
│ Settings                    │
│                             │
│ App                         │
│                             │
│ Version                 1.0.4│
│                             │
│ Check for updates        ›  │
│                             │
└─────────────────────────────┘
```

When a new version exists:

```text
┌─────────────────────────────┐
│       Update available      │
│                             │
│        Version 1.0.5        │
│                             │
│ • New booking features      │
│ • Bug fixes                 │
│                             │
│       [ Update now ]        │
│       [ Later ]             │
└─────────────────────────────┘
```

The user should never have to:

```text
❌ Uninstall old APK
❌ Delete app data
❌ Manually find the new APK
❌ Reconfigure the app
```

They simply press **Update now** and Android handles the replacement.