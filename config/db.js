const mongoose = require("mongoose");

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MongoDB connection error: MONGO_URI is not configured");
    return false;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Do not terminate a Vercel function during module initialization. This
    // keeps the health endpoint available and records the actual DB error in
    // Vercel logs, while database-dependent routes continue to fail normally.
    return false;
  }
};

module.exports = connectDB;
