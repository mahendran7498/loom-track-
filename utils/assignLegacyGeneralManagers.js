/**
 * Assign General Manager accounts created before `createdBy` was introduced
 * to their correct Owner, so they appear on that Owner's management page.
 *
 * Set MIGRATION_OWNER_EMAIL in api/.env, then run:
 *   npm run migrate:gms-to-owner
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../api/.env") });
require("../config/mongoDns");
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  const email = process.env.MIGRATION_OWNER_EMAIL?.trim().toLowerCase();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!email) throw new Error("MIGRATION_OWNER_EMAIL is required");

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const owner = await User.findOne({ email, role: "owner", isActive: true });
    if (!owner) throw new Error("An active Owner with that email was not found");

    const result = await User.updateMany(
      { role: "general_manager", isActive: true, createdBy: null },
      { $set: { createdBy: owner._id } }
    );
    console.log(`Assigned ${result.modifiedCount} legacy General Manager account(s) to ${owner.email}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
