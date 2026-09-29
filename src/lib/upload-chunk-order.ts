/** One request stays small enough to finish on a slow mobile link before a proxy cuts it. */
export const UPLOAD_CHUNK_BYTES = 512 * 1024;

export function chunkAction(nextIndex: number, index: number): 'append' | 'already' | 'gap' {
  if (index === nextIndex) return 'append';
  if (index === nextIndex - 1) return 'already';
  return 'gap';
}
