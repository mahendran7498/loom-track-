const mongoose = require("mongoose");

const machineSchema = new mongoose.Schema(
  {
    assetType: {
      type: String,
      enum: ["Machine", "Compressor", "Air Dryer"],
      default: "Machine",
    },
    machineId: { type: String, required: true, unique: true, trim: true },
    machineName: { type: String, required: true, trim: true },
    machineNumber: { type: String, required: true, unique: true, trim: true },
    // Top-level machine family: looms stay 'loom', compressors/air dryers/other
    // use their own category. machineType remains the free-text subtype
    // (e.g. Loom type "Air Jet" or Compressor model line).
    machineCategory: {
      type: String,
      enum: ["loom", "compressor", "air_dryer", "other"],
      default: "loom",
    },
    machineType: { type: String, trim: true },
    company: { type: String, trim: true },
    modelNumber: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    purchaseDate: { type: Date },
    installationDate: { type: Date },
    warrantyExpiry: { type: Date },
    machineImage: { type: String, default: "" },
    // ── Loom tracking fields (V2) ──
    section: { type: String, trim: true },
    shed: { type: String, trim: true },
    brand: { type: String, trim: true },
    loomType: { type: String, trim: true },
    rpm: { type: Number },
    width: { type: Number },
    runningHours: { type: Number, default: 0 },
    totalDowntime: { type: Number, default: 0 },
    lastMaintenanceDate: { type: Date },
    nextMaintenanceDate: { type: Date },
    assignedEngineer: { type: String, trim: true },
    notes: { type: String, trim: true },
    // ── Compressor monitoring fields (manual entry / future IoT) ──
    pressure: { type: Number },
    temperature: { type: Number },
    oilLevel: { type: String, trim: true },
    oilFilterStatus: { type: String, trim: true },
    airFilterStatus: { type: String, trim: true },
    separatorCondition: { type: String, trim: true },
    differentialPressure: { type: Number },
    oilCarryoverStatus: { type: String, trim: true },
    separatorElementStatus: { type: String, trim: true },
    oRingOrSealStatus: { type: String, trim: true },
    coolantLevel: { type: String, trim: true },
    // ── Air dryer monitoring fields ──
    inletPressure: { type: Number },
    outletPressure: { type: Number },
    dewPoint: { type: Number },
    drainStatus: { type: String, trim: true },
    filterCondition: { type: String, trim: true },
    cleaningStatus: { type: String, trim: true },
    layout: {
      width: { type: Number, default: 2, min: 1 },
      length: { type: Number, default: 2, min: 1 },
      machineCount: { type: Number, min: 1 },
      isLocked: { type: Boolean, default: true },
      lockedAt: { type: Date },
      lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    status: {
      type: String,
      enum: ["Running", "Stopped", "Under Maintenance", "Breakdown", "Idle"],
      default: "Running",
    },
    statusLocked: { type: Boolean, default: false },
    assignedEmployees: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    ],
    documents: [{ type: String }],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

machineSchema.index({ machineName: "text", machineNumber: "text", section: "text", shed: "text" });

module.exports = mongoose.model("Machine", machineSchema);
