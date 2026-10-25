# Creating the EVE SSO application

Every installation uses its own EVE application, so ESI limits and sign-ins are yours.

1. Sign in at <https://developers.eveonline.com> and open **Applications → Create new application**.
2. Name it, choose **Authentication & API Access**.
3. **Callback URL:** `<APP_URL>/auth/eve/callback`, for example `https://eve.example.com/auth/eve/callback`.
   It must match `EVE_REDIRECT_URI` in `.env` exactly.
4. **Scopes:** enable every scope below. Users can still decline individual scopes when they sign in;
   features that need a missing scope stay off for that character.
5. Copy the **Client ID** and **Secret Key** into `.env` as `EVE_CLIENT_ID` and `EVE_CLIENT_SECRET`
   (the installer asks for them).

## Scopes

Character:

```
esi-skills.read_skills.v1
esi-skills.read_skillqueue.v1
esi-location.read_location.v1
esi-industry.read_character_jobs.v1
esi-characters.read_blueprints.v1
esi-assets.read_assets.v1
esi-universe.read_structures.v1
esi-planets.manage_planets.v1
esi-search.search_structures.v1
```

Corporation (optional, for corporation tools):

```
esi-industry.read_corporation_jobs.v1
esi-characters.read_corporation_roles.v1
esi-corporations.read_blueprints.v1
esi-assets.read_corporation_assets.v1
esi-wallet.read_corporation_wallets.v1
esi-corporations.read_projects.v1
```

The authoritative list is `EveSsoController` in the source; if a new release adds scopes, add them to
your application before users re-authorise.

## ESI user agent

CCP asks every application to identify itself. Set `ESI_USER_AGENT` to your app name and a contact,
for example `EveIndustrialist/2.0 (you@example.com; +https://eve.example.com)`. The installer builds
this from the contact email you give it.
