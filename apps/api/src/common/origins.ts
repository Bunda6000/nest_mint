/** WEB_ORIGIN may list several comma-separated origins (e.g. two web domains). */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
