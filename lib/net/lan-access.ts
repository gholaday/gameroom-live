// Chrome hides a page's local address behind a random ".local" name in WebRTC,
// so a phone on the host's own Wi-Fi often can't reach it (and the router may
// not loop traffic sent to the public address back in). Chrome shows the real
// local address to sites that have microphone or camera permission. Granting
// the microphone once, and stopping it straight away, lifts the hiding for
// every connection the host makes afterwards. Nothing is recorded.

export type LanAccess = "on" | "off" | "blocked" | "unsupported";

const query = () => navigator.permissions.query({ name: "microphone" as PermissionName });

const fromState = (state: PermissionState): LanAccess =>
  state === "granted" ? "on" : state === "denied" ? "blocked" : "off";

/** The current state, then every change (the user can revoke it in site settings). */
export function watchLanAccess(onChange: (access: LanAccess) => void) {
  let status: PermissionStatus | null = null;
  let stopped = false;
  const update = () => status && onChange(fromState(status.state));
  query().then(
    (s) => {
      if (stopped) return;
      status = s;
      s.addEventListener("change", update);
      update();
    },
    () => onChange("unsupported"),
  );
  return () => {
    stopped = true;
    status?.removeEventListener("change", update);
  };
}

/** Asks for the microphone and releases it at once. True if granted. */
export async function enableLanAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}
