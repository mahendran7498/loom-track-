const mongoose = require("mongoose");

const oilChangeSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },
    oilChangeDate: { type: Date, required: true, default: Date.now },
    oilType: { type: String, trim: true },
    oilQuantity: { type: Number },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    remarks: { type: String, trim: true },
    // Auto-calculated: oilChangeDate + 6 months (see pre-validate hook below)
    nextOilChangeDate: { type: Date },
    reminderMonthsInterval: { type: Number, default: 6 },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
);

// Automatically compute nextOilChangeDate = oilChangeDate + reminderMonthsInterval
// Runs on create AND on any update that changes oilChangeDate or the interval.
oilChangeSchema.pre("validate", function (next) {
  if (
    this.isNew ||
    this.isModified("oilChangeDate") ||
    this.isModified("reminderMonthsInterval")
  ) {
    const base = new Date(this.oilChangeDate || Date.now());
    const next6 = new Date(base);
    next6.setMonth(next6.getMonth() + (this.reminderMonthsInterval || 6));
    this.nextOilChangeDate = next6;
    // If the due date changed, this is a fresh reminder cycle.
    this.reminderSent = false;
    this.reminderSentAt = undefined;
  }
  next();
});

oilChangeSchema.index({ machine: 1, oilChangeDate: -1 });
oilChangeSchema.index({ nextOilChangeDate: 1, reminderSent: 1 });

module.exports = mongoose.model("OilChange", oilChangeSchema);
