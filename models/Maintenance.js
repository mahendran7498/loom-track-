const mongoose = require("mongoose");

const maintenanceSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },
    maintenanceDate: { type: Date, required: true, default: Date.now },
    maintenanceType: {
      type: String,
      // Corrective remains accepted only for historical records. New entries
      // use Idle instead (the frontend no longer offers Corrective).
      enum: [
        "Preventive",
        "Idle",
        "Breakdown",
        "Inspection",
        "Other",
        "Corrective",
        "Compressor Maintenance",
        "Air Dryer Maintenance",
      ],
      required: true,
    },
    maintenanceCategory: {
      type: String,
      enum: ["General", "Compressor", "Air Dryer"],
      default: "General",
    },
    componentsChecked: [{ type: String, trim: true }],
    inspectionDetails: { type: mongoose.Schema.Types.Mixed },
    engineerName: { type: String, trim: true },
    sparePartsUsed: { type: Boolean, default: false },
    sparePartsDetails: [
      {
        name: { type: String, trim: true },
        partNumber: { type: String, trim: true },
        quantity: { type: Number, min: 0 },
        unitCost: { type: Number, min: 0 },
        totalCost: { type: Number, min: 0 },
        replacementDate: { type: Date },
        remarks: { type: String, trim: true },
        photo: { type: String, trim: true },
      },
    ],
    finalStatus: {
      type: String,
      enum: ["Completed", "Due Soon", "Overdue", "Not Scheduled", "Requires Attention"],
      default: "Completed",
    },
    description: { type: String, trim: true },
    machineRunningHours: { type: Number },
    nextMaintenanceDate: { type: Date },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
    technicianName: { type: String, trim: true },
    remarks: { type: String, trim: true },
    cost: { type: Number, default: 0 },
    photos: [{ type: String }],
    videos: [{ type: String }],
    reportPdf: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    approvalStatus: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected"],
      default: "Submitted",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

maintenanceSchema.index({ machine: 1, maintenanceDate: -1 });
maintenanceSchema.index({ nextMaintenanceDate: 1 });

module.exports = mongoose.model("Maintenance", maintenanceSchema);
