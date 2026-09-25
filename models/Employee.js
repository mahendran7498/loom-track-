const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Mandatory: this is the number reminder notifications are sent to
    phoneNumber: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    profilePhoto: { type: String, default: "" },
    assignedMachines: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Machine" },
    ],
    isActive: { type: Boolean, default: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Owner or general manager responsible for this employee.
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
