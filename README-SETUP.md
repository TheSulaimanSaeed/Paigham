# Paigham v4 — Setup & Deployment Checklist

Follow these 4 quick steps so every feature works properly:

## 1. Upload All Files to GitHub
Extract all files from `paigham-v4.zip` into the **root** of your GitHub repository (`paigham.live`), replacing the older files:
- `index.html`, `config.js`, `posts.js`, `manifest.json`, `sw.js`, `robots.txt`, `sitemap.xml`, `CNAME`
- Keep your existing `logo.png`, `icon-192.png`, `icon-512.png`, and `img/` folder.
- Upload your own profile picture to the root folder named **`dp.jpg`** (or `dp.png` / `dp.webp`) so it appears next to **About the Founder**.

## 2. Run `supabase-setup.sql` in Supabase
1. Open your Supabase project -> **SQL Editor** -> **New Query**.
2. Paste the entire contents of `supabase-setup.sql` and click **Run**.
3. This sets up:
   - `profiles` table (compulsory **Field of Study**, compulsory **Future Research Interests**, optional **Bio**, optional **Instagram**, and **Profile Photo**)
   - `posts` table (supports **Science** [Physics, Chemistry, Biology], **Model Organisms**, **Geopolitics**, and **Philosophy**, plus **Review Articles**, photos, and PDFs)
   - `comments` table (supports text + optional photo/PDF attachments)
   - `attachments` storage bucket (10 MB limit per upload)

## 3. Switch Supabase Emails to 6-Digit Verification Codes (Gmail / Email OTP)
So users verify their signup and reset forgotten passwords using a **6-digit code** directly inside Paigham:
1. In Supabase Dashboard, go to **Authentication -> Emails** (or **Email Templates**).
2. Open **Confirm signup** and replace `{{ .ConfirmationURL }}` with `{{ .Token }}`:
   ```html
   <h2>Verify your Paigham account</h2>
   <p>Enter this 6-digit verification code on Paigham:</p>
   <p style="font-size:26px;font-weight:bold;letter-spacing:4px;">{{ .Token }}</p>
   ```
3. Open **Reset password** and replace `{{ .ConfirmationURL }}` with `{{ .Token }}`:
   ```html
   <h2>Reset your Paigham password</h2>
   <p>Enter this 6-digit recovery code on Paigham to set a new password:</p>
   <p style="font-size:26px;font-weight:bold;letter-spacing:4px;">{{ .Token }}</p>
   ```
4. Click **Save** on both templates.

## 4. Index Your Name on Google
1. Open [Google Search Console](https://search.google.com/search-console) and add `https://paigham.live`.
2. Submit `https://paigham.live/sitemap.xml`.
