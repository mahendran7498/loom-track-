const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: [
        "Daily",
        "Weekly",
        "Monthly",
        "Yearly",
        "Machine",
        "Employee",
        "Oil Change",
        "Spare",
      ],
      required: true,
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    machine: { type: mongoose.Schema.Types.ObjectId, ref: "Machine" },
    dateRangeStart: { type: Date },
    dateRangeEnd: { type: Date },
    filters: { type: mongoose.Schema.Types.Mixed },
    format: { type: String, enum: ["pdf", "excel", "csv"], default: "pdf" },
    fileUrl: { type: String },
    status: {
      type: String,
      enum: ["Submitted", "Reviewed"],
      default: "Submitted",
    },
    submittedTo: [{ type: String, enum: ["general_manager", "owner"] }],
    historySnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
