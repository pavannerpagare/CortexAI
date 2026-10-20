import "dotenv/config";
import Redis from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error(
    "REDIS_URL is not set. Configure it in this service's .env (see .env.example).",
  );
}

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

export default redis;
