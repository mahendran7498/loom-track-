const mongoose = require("mongoose");

const companyLayoutSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, unique: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    length: { type: Number, required: true, min: 1 },
    machineCount: { type: Number, min: 1 },
    isLocked: { type: Boolean, default: true },
    lockedAt: { type: Date, default: Date.now },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanyLayout", companyLayoutSchema);
