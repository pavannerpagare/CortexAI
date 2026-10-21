import express from "express";
import dotenv from "dotenv";
import connectDb from "./config/db.js";
import router from "./routes/chat.routes.js";

dotenv.config();

const port = process.env.PORT;
if (!port) {
  console.error("PORT is not set. Configure it in backend/services/chat/.env");
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use("/", router);

app.get("/", (req, res) => {
  res.json({ message: "hello from chat" });
});

app.listen(port, async () => {
  console.log(`chat started at ${port}`);
  try {
    await connectDb();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
