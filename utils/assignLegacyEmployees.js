/**
 * Assign employees created before the General Manager hierarchy was added.
 *
 * Usage (PowerShell):
 *   $env:MIGRATION_GENERAL_MANAGER_EMAIL="gm@company.com"
 *   npm run migrate:employees-to-gm
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../api/.env") });
require("../config/mongoDns");
const mongoose = require("mongoose");
const User = require("../models/User");
const Employee = require("../models/Employee");

(async () => {
  const email = process.env.MIGRATION_GENERAL_MANAGER_EMAIL?.trim().toLowerCase();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!email) throw new Error("MIGRATION_GENERAL_MANAGER_EMAIL is required");

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const generalManager = await User.findOne({
      email,
      role: "general_manager",
      isActive: true,
    });
    if (!generalManager) {
      throw new Error("An active General Manager with that email was not found");
    }

    // `manager: null` also matches the older documents where this field is absent.
    const result = await Employee.updateMany(
      { isActive: true, manager: null },
      { $set: { manager: generalManager._id } }
    );
    console.log(`Assigned ${result.modifiedCount} existing employee(s) to ${generalManager.email}`);
  } finally {
    await mongoose.disconnect();
  }
})();
