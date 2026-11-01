import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connectDb from "./config/db.js";
import router from "../routes/auth.route.js";
import requireGateway from "../../shared/middleware/requireGateway.js";

dotenv.config();

const port = process.env.PORT;
if (!process.env.GATEWAY_SECRET) {
  console.error("GATEWAY_SECRET is not set for the auth service.");
  process.exit(1);
}
if (!port) {
  console.error("PORT is not set. Configure it in backend/services/auth/.env");
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(requireGateway);
app.use("/", router);

app.get("/", (req, res) => {
  res.json({ message: "hello from auth" });
});

app.listen(port, async () => {
  console.log(`auth started at ${port}`);
  try {
    await connectDb();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
