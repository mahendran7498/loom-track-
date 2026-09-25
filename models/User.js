const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Users collection is the authentication identity for the system.
 * Roles are ordered: admin -> owner -> general_manager -> employee.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["admin", "owner", "general_manager", "employee"],
      required: true,
      default: "employee",
    },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    // The higher-level account that provisioned this account.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    profilePhoto: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
