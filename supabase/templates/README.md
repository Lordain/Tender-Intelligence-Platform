# Supabase hosted email templates

These files are the source-controlled copy of the hosted Supabase Auth templates. Supabase does not deploy them from application code automatically.

For the Magic Link email, open **Supabase Dashboard → Authentication → Email Templates → Magic Link**, then:

1. Copy `magic-link-subject.txt` into the Subject field.
2. Copy `magic-link.html` into the Message body.
3. Save and send a test login email.

Keep `{{ .ConfirmationURL }}` unchanged; Supabase replaces it with the one-time login URL.
