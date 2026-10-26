/**
 * Orders codecs so `mimeType` comes first, keeping the browser's order
 * otherwise. Used with setCodecPreferences to prefer H.264, which most
 * machines hardware encode.
 */
export function preferCodec<T extends { mimeType: string }>(codecs: T[], mimeType: string): T[] {
  const wanted = mimeType.toLowerCase();
  const first = codecs.filter((c) => c.mimeType.toLowerCase() === wanted);
  return first.length ? [...first, ...codecs.filter((c) => c.mimeType.toLowerCase() !== wanted)] : codecs;
}
