# Meetings: connecting Google Calendar

PMT's **Meetings** page shows the Google Calendars of:

- content@finace.co
- projects@finace.co
- product@finace.co
- animate@finace.co

The backend reads them every 10 minutes with the Google Calendar API. Access is read-only and the API is free: the default quota is about 1 million requests a day, and this uses a few hundred.

The setup takes about 10 minutes and has to be done once by a **Google Workspace super admin** for finace.co.

## 1. Create a Google Cloud project and turn on the Calendar API

1. Go to <https://console.cloud.google.com/> and sign in with a finace.co account.
2. Click the project picker at the top, then **New project**. Name it `PMT Calendar` and create it. No billing account is needed.
3. Open **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**.

## 2. Create a service account and its key

1. Open **IAM & Admin → Service accounts**, then click **Create service account**.
2. Name it `pmt-calendar-reader`, click **Create and continue**, skip the optional roles, and click **Done**.
3. Open the new service account and copy its **Unique ID**, a long number. You need it in step 3.
4. On the **Keys** tab, click **Add key → Create new key → JSON**. A `.json` file downloads.
   Treat this file like a password. Don't email it around or commit it to git.

> If key creation is blocked by the "Disable service account key creation" organisation policy, a super admin can switch that policy off for this project under **IAM & Admin → Organisation policies**.

## 3. Allow it to read calendars (domain-wide delegation)

1. Go to <https://admin.google.com> and open **Security → Access and data control → API controls**.
2. Click **Manage domain-wide delegation**, then **Add new**.
3. **Client ID**: the Unique ID from step 2.3.
4. **OAuth scopes**: exactly this one line. It's read-only:

   ```
   https://www.googleapis.com/auth/calendar.readonly
   ```

5. Click **Authorise**. It can take a few minutes to start working.

## 4. Give the key to PMT

On the backend host, Render or wherever `server.py` runs, add these environment variables:

| Variable | Value |
|---|---|
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` | The whole contents of the JSON key file. If the host doesn't accept multi-line values, paste it base64-encoded instead. |
| `CALENDAR_IDS` | Optional. Defaults to `content@finace.co,projects@finace.co,product@finace.co,animate@finace.co` |
| `CALENDAR_SYNC_MINUTES` | Optional. Defaults to `10` |

To get the base64 version on Windows (PowerShell):

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pmt-calendar-reader.json"))
```

Redeploy the backend. Within a minute or so the Meetings page shows the meetings, and the yellow "isn't connected yet" bar goes away. An admin can also press the ↻ button on the page to sync straight away.

## Good to know

- **Read-only.** PMT never creates, edits or deletes events. Changes are made in Google Calendar and show up in PMT within about 10 minutes.
- **Private events** (visibility "Private" in Google) show in PMT only as a "Busy" block, with no title, guests or notes.
- **What's synced:** 31 days back and 92 days ahead. Events are stored in the `calendar_events` collection, so the page still works if Google is briefly unreachable.
- **Who can see it:** admins, managers and members. HR / Finance accounts can't.
- **If one calendar fails** (for example a mailbox was renamed), the page shows a red bar naming it and keeps showing its last copy.
- **To add or remove a calendar,** change `CALENDAR_IDS` and redeploy. To give a calendar a friendly name and colour on the page, edit `CALENDARS` at the top of `frontend/src/pages/MeetingsPage.jsx`.
- **Meetings are tagged with a client** when a guest's email domain matches a contact saved on that client in PMT.
