const mongoose = require("mongoose");

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    leaveType: {
      type: String,
      enum: ["Casual", "Sick", "Earned", "Unpaid", "Other"],
      default: "Casual",
    },
    reason: { type: String, trim: true, required: true },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employee: 1, createdAt: -1 });

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
