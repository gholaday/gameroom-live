# Signaling Worker

A Cloudflare Worker plus one Durable Object per room that speaks the PeerJS
server protocol. The app's PeerJS client connects here instead of the public
`0.peerjs.com` broker. Only connection setup (offers, answers, ICE candidates)
passes through. Video, audio and input go peer to peer, so traffic here is a
few KB per guest join.

Hibernating WebSockets keep idle rooms free. Client heartbeats are answered
without waking the object.

## Local

```bash
cd signaling && npm install && npm run dev
```

Then set `NEXT_PUBLIC_SIGNALING_URL=ws://127.0.0.1:8787/` in the app's
`.env.local` and restart `next dev`. Without that variable the app uses PeerJS's
public broker, so the Worker is optional in development.

## Deploy

```bash
cd signaling && npx wrangler login && npm run deploy
```

1. Set `ALLOWED_ORIGINS` to your site's exact origins, e.g.
   `https://gameroom.example,https://gameroom-git-main.vercel.app`, in the
   Cloudflare dashboard or in `wrangler.jsonc` `vars`.
2. In Vercel, set `NEXT_PUBLIC_SIGNALING_URL` to
   `wss://gameroom-signaling.<your-subdomain>.workers.dev/` and redeploy. It is
   inlined at build time.

## Rules

- Peer ids must carry a room code (`gameroom-live-ABCD`, or
  `gameroom-live-ABCD-<hex>` for guests). That code picks the Durable Object.
- An id held by a socket with a different token gets `ID-TAKEN`. The host
  retries this while a refresh frees its old socket.
- An offer to an id that isn't connected gets `EXPIRE`, which the app shows as
  "room closed".
- Up to 16 sockets per room, messages up to 64 KB, other origins refused.
