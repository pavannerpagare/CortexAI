import mongoose from "mongoose";

const connectDb = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Configure it in this service's .env (see .env.example).",
    );
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("[db] connected");
  } catch (error) {
    throw new Error(`[db] connection failed: ${error.message}`);
  }
};

export default connectDb;
