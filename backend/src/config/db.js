import mongoose from "mongoose";

// Connects to MongoDB. Throws when unreachable;
// index.js catches this before listen and prints a friendly message.
export async function connectDB(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected, database:", mongoose.connection.name);
  // Single-user era left a UNIQUE index on insights.key alone; per-user
  // caches need the same key for every account, so drop the legacy index.
  // The (userId, key) unique index from the model is created by syncIndexes.
  try {
    await mongoose.connection.collection("insights").dropIndex("key_1");
    console.log("Dropped legacy insights key_1 index");
  } catch {
    // already gone (or never existed): nothing to do
  }
  await mongoose.connection.syncIndexes();
}
