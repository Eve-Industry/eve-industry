# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") on this repository.

Include what you found, how to reproduce it, and the affected version. This is
a volunteer project provided as is: there is no guaranteed response time, but
reports are taken seriously and fixed as time allows.

## Supported versions

Only the latest release receives fixes.

## For operators

- Keep `APP_DEBUG=false` and serve over HTTPS (the bundled Caddy does this).
- Never expose the queue Redis, MySQL or `/horizon` to the internet.
- Set `ESI_ENCRYPT_TOKENS=true` so refresh tokens are encrypted at rest.
- Back up `APP_KEY`: losing it makes encrypted data unreadable.
- Rotate the generated admin password after first login.
