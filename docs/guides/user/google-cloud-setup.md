# Set up Google Cloud credentials

Use this guide before installing the server. It produces the two values the server cannot run without — an OAuth client ID and client secret — and puts the Google project in the state where consent actually grants the access the server asks for.

Everything here happens in the [Google Cloud Console](https://console.cloud.google.com) against a Google account you control. It is a one-time procedure per project; you only return to it to change scopes.

## Before you begin

- A Google account. A personal account is fine; a Workspace account may be governed by an administrator who restricts unverified apps.
- Roughly twenty minutes. The console renames and rearranges these screens periodically, so match on the labels rather than the exact navigation path.

## 1. Create a project

1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Project dropdown → **New Project**.
3. Name it (`mcp-gsuite` is a reasonable choice) → **Create**.
4. Make sure the new project is the one selected in the dropdown before continuing. Everything below applies to the selected project, and doing step 4 against the wrong project is the quietest way to waste this procedure.

## 2. Enable the APIs

The server registers tools for Gmail, Calendar, Drive and Sheets. A tool whose API is not enabled registers normally and then fails at call time with a Google error naming the disabled API, so enable each API you intend to use:

1. **APIs & Services → Library**.
2. Search for and **Enable** each of: **Gmail API**, **Google Calendar API**, **Google Drive API**, **Google Sheets API**.

Enabling an API you never call costs nothing. Skipping one you do call produces a failure that looks like a permissions problem and is not.

## 3. Configure the OAuth consent screen

For brand-new projects Google gates this behind a one-time wizard. If you see **"Google Auth Platform not configured yet"** with a **Get Started** button, work through 3a first. Otherwise go straight to 3b.

### 3a. First-time setup

1. **APIs & Services → OAuth consent screen** → **Get Started**.
2. **App Information**: app name and your support email → **Next**.
3. **Audience**: **External** → **Next**.
4. **Contact Information**: your email → **Next**.
5. Agree to the user-data policy → **Continue** → **Create**.

### 3b. Publish the app

1. **OAuth consent screen → Audience**.
2. **Publishing status** → **Publish App** → **Confirm**.

Publishing avoids the seven-day refresh-token expiry that "Testing" mode imposes, which otherwise makes you re-authenticate every week. The app stays unverified, which is fine for personal use: you will see a one-time **Advanced → continue to (unsafe)** warning during sign-in, because you are the app's only user and Google has not reviewed it.

### 3c. Declare the scopes

**This step is mandatory, and it is the one that gets skipped.** If a scope is not pre-declared here, Google silently drops it from the consent screen. Sign-in then succeeds, the token file looks healthy, and every API call returns 403.

1. **OAuth consent screen → Data Access** → **Add or remove scopes**.
2. Tick each scope the server requests by default:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/spreadsheets`
3. **Update** → **Save**.

These four are the default set defined as `GSUITE_DEFAULT_SCOPES` in [`src/config/index.ts`](../../../src/config/index.ts). If you narrow the set with `MCP_GSUITE_SCOPES` — see [Configure the server](configuration.md) — declare exactly the scopes you will request, and no fewer.

Changing scopes here does not change a token you already hold. After any change on this tab, delete the token file (`~/.local/state/ki/mcp-gsuite/oauth-tokens.json` by default) and authenticate again so consent is re-prompted with the new set.

## 4. Create the OAuth client

1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
2. Application type: **Web application**. Not "Desktop app" — the server completes the flow on a local HTTP callback, which the web application type is the one that supports.
3. Name: anything (`mcp-gsuite` again is fine).
4. **Authorized redirect URIs** → **Add URI** → `http://localhost:3334/auth/callback`. This must match `MCP_GSUITE_REDIRECT_URI` exactly, including the port. If you change the auth server's port later, change it in both places.
5. **Create**, then copy the **Client ID** and **Client Secret**.

## Verify

You should now have:

- A client ID of the form `NNNNNN-xxxxxxxx.apps.googleusercontent.com`.
- A client secret, which Google shows once — copy it now; you can always issue a new one later.
- `http://localhost:3334/auth/callback` listed under the client's authorised redirect URIs.
- The four scopes listed on the **Data Access** tab.

The secret is a credential. Keep it out of version control; the server only ever reads it from the environment. See [Install and connect the server](installation.md) for where to put it.

## Recovery

**You lost the client secret.** Open the client under **Credentials**, delete the old secret and add a new one, then update your client configuration. The client ID does not change.

**Sign-in shows "Access blocked: this app's request is invalid".** The redirect URI in the request does not match one registered on the client. Compare the value of `MCP_GSUITE_REDIRECT_URI` against the **Authorized redirect URIs** list character by character; a trailing slash or a different port is enough to fail.

**Sign-in shows "Google hasn't verified this app".** Expected for an unverified app with an external audience. Choose **Advanced**, then **continue to (unsafe)**. If your account is managed by a Workspace administrator who blocks unverified apps, this is the point at which you need them.

**Calls return 403 after a successful sign-in.** The scope was not granted. Work through [Troubleshooting](troubleshooting.md), which covers inspecting the granted scope set in the token file and repairing it.
