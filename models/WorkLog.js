const mongoose = require("mongoose");

const workLogSchema = new mongoose.Schema(
  {
    workType: {
      type: String,
      enum: ["material_handling", "small_work"],
      required: true,
    },
    machine: { type: mongoose.Schema.Types.ObjectId, ref: "Machine" },
    materialName: { type: String, trim: true },
    quantity: { type: Number },
    unit: { type: String, trim: true },
    description: { type: String, trim: true },
    photos: [{ type: String }],
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["Submitted", "Reviewed"],
      default: "Submitted",
    },
    submittedTo: [{ type: String, enum: ["general_manager", "owner"] }],
  },
  { timestamps: true }
);

workLogSchema.index({ machine: 1, createdAt: -1 });
workLogSchema.index({ doneBy: 1, createdAt: -1 });

module.exports = mongoose.model("WorkLog", workLogSchema);