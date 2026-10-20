import "dotenv/config";

const REQUIRED_ENV = [
  "PORT",
  "FRONTENDS_URL",
  "AUTH_SERVICE",
  "CHAT_SERVICE",
  "AGENT_SERVICE",
  "REDIS_URL",
];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `Missing required environment variables: ${missing.join(", ")}. ` +
      "See backend/gateway/.env.example.",
  );
  process.exit(1);
}
