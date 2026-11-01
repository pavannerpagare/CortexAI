import express from "express";
import dotenv from "dotenv";
import connectDb from "./config/db.js";
import router from "./routes/agent.route.js";
import requireGateway from "../../shared/middleware/requireGateway.js";

dotenv.config();

const port = process.env.PORT;
if (!process.env.GATEWAY_SECRET) {
  console.error("GATEWAY_SECRET is not set for the agent service.");
  process.exit(1);
}
if (!port) {
  console.error("PORT is not set. Configure it in backend/services/agent/.env");
  process.exit(1);
}

const app = express();

app.use(requireGateway);
app.use(express.json({ limit: "8mb" }));
app.use("/", router);

app.get("/", (req, res) => {
  res.json({ message: "hello from agent" });
});

app.listen(port, async () => {
  console.log(`agent started at ${port}`);
  try {
    await connectDb();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
