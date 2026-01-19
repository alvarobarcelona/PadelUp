# Supabase Email Testing Guide

## 1. Local Testing (Instant)

1. **Restart Supabase**:
   ```bash
   npx supabase stop
   npx supabase start
   ```
2. **Trigger Emails**:
   - Sign up a new user or use "Forgot Password".
3. **View in Inbucket**:
   - Open **[http://localhost:54424](http://localhost:54424)**.
   - Click the email to see the preview.

## 2. Real Client Verification (Gmail/Hotmail)

Since local Supabase intercepts emails, they won't go to your real inbox automatically. To test the rendering on **Gmail** or **Hotmail**:

### Option A: Use Online Testers (Recommended, Fast)

Since PutsMail is retired, you can use these free alternatives to send your HTML directly to your real inbox:

#### 1. [htmltest.email](https://htmltest.email/) (Simplest)

1. Go to **[htmltest.email](https://htmltest.email/)**.
2. Paste the code from `supabase/templates/confirmation.html`.
3. **Crucial**: Replace `{{ .ConfirmationURL }}` with a dummy link (e.g., `#`).
4. Enter your email and send.

#### 2. [Testi.at](https://testi.at/)

1. Go to **[Testi.at](https://testi.at/)**.
2. Upload your HTML or paste it.
3. Send a test email to your address.

### Option B: Configure Real SMTP (Advanced)

If you really want Supabase to send them directly:

1. Open `supabase/config.toml`.
2. Find `[auth.email.smtp]`.
3. Uncomment and fill in your SMTP details (e.g., SendGrid, AWS SES, or a Gmail App Password).
   ```toml
   [auth.email.smtp]
   enabled = true
   host = "smtp.gmail.com"
   port = 587
   user = "your_email@gmail.com"
   pass = "your_app_password"
   sender_name = "PadelUp Local"
   ```
4. Restart Supabase.
5. Trigger the flow again in your app.

**Note**: Be careful not to commit your secrets if you choose Option B!
