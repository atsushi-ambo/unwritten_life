// One default for the server, the launcher and the self-call guard. 4317 was
// OpenTelemetry's OTLP port; 4341 sits after the other local apps (4330-4340).
export const DEFAULT_PORT = 4341;

export function appPort(env = process.env) {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid PORT");
  return port;
}
