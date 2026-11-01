import "./config/env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getCurrentUser } from "./controllers/user.controller.js";
import protect from "./middleware/auth.middleware.js";
import { proxyWithHeader } from "./utils/proxyWithHeader.js";
import morgan from "morgan";

const port = process.env.PORT;

const app = express();

const allowedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  process.env.FRONTENDS_URL,
]
  .filter(Boolean)
  .map((url) => url.replace(/\/+$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("CORS blocked origin:", origin);
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api/auth", proxyWithHeader(process.env.AUTH_SERVICE));
app.use("/api/chat", protect, proxyWithHeader(process.env.CHAT_SERVICE));
app.use("/api/agent", protect, proxyWithHeader(process.env.AGENT_SERVICE));
app.get("/api/me", protect, getCurrentUser);

app.get("/", (req, res) => {
  res.json({ message: "hello from gateway" });
});

app.listen(port, () => {
  console.log(`gateway started at ${port}`);
});
