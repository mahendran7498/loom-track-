/**
 * Bootstrap script for the first Admin login, since the register endpoint
 * requires an existing privileged user to be authenticated.
 *
 * Usage:
 *   npm run seed:admin
 *   npm run seed:admin -- --reset-password
 *   npm run seed:admin -- --promote-admin
 *
 * Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL,
 * BOOTSTRAP_ADMIN_PHONE, and BOOTSTRAP_ADMIN_PASSWORD only in the shell or
 * in a temporary, git-ignored env file before running this script. The
 * password is never printed. Existing accounts are left unchanged unless
 * --reset-password is explicitly supplied.
 */
require("dotenv").config();
require("../config/mongoDns");
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const resetPassword = process.argv.includes("--reset-password");
  const promoteAdmin = process.argv.includes("--promote-admin");

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!email || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required"
    );
  }
  if (password.length < 6) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const existing = await User.findOne({ email }).select("+password");

    if (existing) {
      if (existing.role !== "admin") {
        if (!promoteAdmin) {
          throw new Error(
            `An account already exists for ${email} with the '${existing.role}' role. Run again with --promote-admin to explicitly promote it.`
          );
        }
        existing.role = "admin";
        await existing.save({ validateBeforeSave: false });
        console.log(`Existing account promoted to admin: ${email}`);
      }
      if (!resetPassword) {
        console.log(
          `Admin already exists: ${email}. Use --reset-password to explicitly reset its password.`
        );
        return;
      }

      existing.password = password;
      await existing.save();
      console.log(`Password reset for existing admin: ${email}`);
      return;
    }

    await User.create({
      name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin",
      email,
      phoneNumber: process.env.BOOTSTRAP_ADMIN_PHONE?.trim() || "0000000000",
      password,
      role: "admin",
    });
    console.log(`Admin account created: ${email}`);
  } finally {
    await mongoose.disconnect();
  }
})();
