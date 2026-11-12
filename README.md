# b64labs.com

A static site on Cloudflare Workers, plus one small Worker route for the contact form.
There is no framework and no build step: `public/` is the site.

## Run it

```sh
npm install
npm run dev
```

Locally, Wrangler simulates the contact form's email instead of sending it.

## Deploy it

The form sends mail from `noreply@b64labs.com` to `contact@b64labs.com` (`vars` in `wrangler.jsonc`) with Cloudflare's `send_email` binding. Set this up once in the Cloudflare dashboard:

1. Onboard `b64labs.com` under Email Service → Email Sending. Sending needs the Workers Paid plan.
2. In Email Routing, add a rule that forwards `contact@b64labs.com` to a verified inbox.

The form is guarded by [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (free). The Worker rejects any message without a valid token. Set it up once:

1. The widget's site key is in `data-sitekey` in `public/index.html`. Its hostnames in the Turnstile dashboard must include every host the form runs on.
2. Store its secret key for production with `npx wrangler secret put TURNSTILE_SECRET`.
3. The Worker accepts only tokens for the `contact` action, from a hostname in `TURNSTILE_HOSTNAMES` (comma-separated; a leading dot allows subdomains). Production allows `b64labs.com`.

Without the secret, every message is refused. Previews have neither the secret nor `TURNSTILE_HOSTNAMES`, so their form refuses messages too. To enable it, add `TURNSTILE_HOSTNAMES` (for example `.<account>.workers.dev`) to `previews.vars` and run `npx wrangler preview secret put TURNSTILE_SECRET`. For `npm run dev`, put `TURNSTILE_SECRET=…` and `TURNSTILE_HOSTNAMES=localhost` in `.dev.vars`, and add `localhost` to the widget's hostnames.

Pushes to `main` deploy through Workers Builds, which also attaches `b64labs.com` as a custom domain. Other branches get a Preview with `npx wrangler preview`, configured by the `previews` block in `wrangler.jsonc`. Previews send real mail to the same address.

## How the hero works

`public/terrain.txt` holds a mountain that doesn't exist: 32 km of terrain, 256 × 256 elevation bytes, in base64. `npm run terrain` stitches it from eleven pieces of real mountain ranges, listed in `scripts/make-terrain.mjs`. All of them come from USGS 3DEP or SRTM data, which is why the footer credits the USGS.

`public/js/terrain.js` lays a hexagonal grid over it. Each cell falls in a 200 m elevation band, and a side lights up when the neighbouring cell is in a different band. Six sides make six bits, so every cell is one base64 character.

To make another mountain, change the list of pieces and run `npm run terrain`. If a piece comes from outside the USGS-covered ranges, check its credit in the [Terrain Tiles attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

## Brand

- **Mark:** a hexagon whose sides are the six bits of a base64 character. `b` is `011011`, read clockwise from the top. Files: `public/logo.svg` and `public/favicon.svg`. The logo is also a real cell on the mountain: the highest one that reads `b`.
- **Colours:** background `#06080b`, text `#ece9e2`, accent `#ff5b2e`.
- **Type:** [Martian Mono](https://github.com/evilmartians/mono), self-hosted under the SIL Open Font License.
