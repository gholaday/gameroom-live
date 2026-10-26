// ICE servers for WebRTC. Mints short-lived Cloudflare TURN credentials when
// CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN are set, otherwise
// falls back to STUN only (fine on most home networks, fails on strict NAT).

const STUN_ONLY = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };

export async function GET() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return Response.json(STUN_ONLY);

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
    },
  );
  if (!res.ok) return Response.json(STUN_ONLY);
  return Response.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
}
