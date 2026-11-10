# b64labs.com

A static site on Cloudflare Workers, plus one small Worker route for the contact form.
There is no framework and no build step: `public/` is the site.

## Run it

```sh
npm install
echo 'CONTACT_TO=you@example.com' > .dev.vars
npm run dev
```

Locally, Wrangler logs messages from the contact form instead of sending them.

## Deploy it

The form sends mail with Cloudflare's `send_email` binding. Set this up once:

1. In the Cloudflare dashboard, enable Email Routing on `b64labs.com` and verify the address that should receive messages.
2. Run `npx wrangler secret put CONTACT_TO` and enter that address. It stays out of the repository.
3. Run `npm run deploy`. This also attaches `b64labs.com` as a custom domain.

## How the hero works

`public/terrain.txt` holds a mountain that doesn't exist: 32 km of terrain, 256 × 256 elevation bytes, in base64. `npm run terrain` stitches it from eleven pieces of real mountain ranges, listed in `scripts/make-terrain.mjs`. All of them come from USGS 3DEP or SRTM data, which is why the footer credits the USGS.

`public/js/terrain.js` lays a hexagonal grid over it. Each cell falls in a 200 m elevation band, and a side lights up when the neighbouring cell is in a different band. Six sides make six bits, so every cell is one base64 character.

To make another mountain, change the list of pieces and run `npm run terrain`. If a piece comes from outside the USGS-covered ranges, check its credit in the [Terrain Tiles attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

## Brand

- **Mark:** a hexagon whose sides are the six bits of a base64 character. `b` is `011011`, read clockwise from the top. Files: `public/logo.svg` and `public/favicon.svg`. The logo is also a real cell on the mountain: the highest one that reads `b`.
- **Colours:** background `#06080b`, text `#ece9e2`, accent `#ff5b2e`.
- **Type:** [Martian Mono](https://github.com/evilmartians/mono), self-hosted under the SIL Open Font License.
