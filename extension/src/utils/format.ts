/**
 * Formats a duration in seconds into a readable clock timestamp string (e.g. MM:SS or HH:MM:SS).
 */
export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const paddedMins = String(mins).padStart(2, "0");
  const paddedSecs = String(secs).padStart(2, "0");
  
  if (hrs > 0) {
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }
  
  return `${paddedMins}:${paddedSecs}`;
}
export default formatTimestamp;
