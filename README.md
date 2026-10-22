# Celaris Labs

Static company site for [celarislabs.ai](https://celarislabs.ai).

The partnerships form posts to `/api/partnerships`, which stores the note in the TripProof Supabase `partnership_inquiries` table and checks Cloudflare Turnstile.

## Local

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 4173
```

## Deploy

Cloudflare Pages builds from this repository’s root. The custom domain `celarislabs.ai` is attached to the Pages project.
