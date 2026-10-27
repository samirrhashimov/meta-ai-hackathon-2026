import mongoose from "mongoose";

// Connects to MongoDB. Throws when unreachable;
// index.js catches this before listen and prints a friendly message.
export async function connectDB(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected, database:", mongoose.connection.name);
}
