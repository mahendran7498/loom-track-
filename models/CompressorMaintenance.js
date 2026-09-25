const mongoose = require("mongoose");

const sparePartUsedSchema = new mongoose.Schema(
  {
    spareName: { type: String, required: true, trim: true },
    spareNumber: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    replacementDate: { type: Date },
    remarks: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
  },
  { _id: false }
);

sparePartUsedSchema.pre("validate", function (next) {
  this.totalCost = (Number(this.quantity) || 0) * (Number(this.unitCost) || 0);
  next();
});

const inspectionSubSchema = {
  checked: { type: Boolean, default: false },
  condition: { type: String, trim: true },
  notes: { type: String, trim: true },
  photos: { type: [String], default: [] },
  replacementDate: { type: Date },
  nextReplacementDate: { type: Date },
};

const oilSeparatorSubSchema = {
  checked: { type: Boolean, default: false },
  separatorCondition: {
    type: String,
    index: true,
    enum: ["Good", "Fair", "Poor", "Replace"],
  },
  differentialPressure: {
    type: String,
    enum: ["Normal", "High", "Critical"],
  },
  oilCarryover: { type: String, enum: ["None", "Slight", "Heavy"] },
  separatorElementCondition: {
    type: String,
    enum: ["Good", "Worn", "Clogged", "Replace"],
  },
  oringSealCondition: {
    type: String,
    enum: ["Good", "Cracked", "Hardened", "Leaking"],
  },
  cleaningStatus: { type: String, enum: ["Cleaned", "Not Cleaned", "Replace"] },
  replacementStatus: {
    type: String,
    enum: ["Not Required", "Required", "Replaced"],
  },
  replacementDate: { type: Date },
  nextReplacementDate: { type: Date },
  notes: { type: String, trim: true },
  photos: { type: [String], default: [] },
};

const coolantSubSchema = {
  checked: { type: Boolean, default: false },
  coolantLevel: { type: String, enum: ["Full", "Low", "Empty"] },
  coolantCondition: { type: String, enum: ["Clear", "Discoloured", "Contaminated"] },
  coolantLeakage: { type: String, enum: ["None", "Minor", "Major"] },
  coolerRadiatorCondition: {
    type: String,
    enum: ["Good", "Clogged", "Leaking", "Replace"],
  },
  coolantReplacementDate: { type: Date },
  nextCoolantServiceDate: { type: Date },
  notes: { type: String, trim: true },
  photos: { type: [String], default: [] },
};

const compressorMaintenanceSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },
    maintenanceType: {
      type: String,
      default: "Compressor Maintenance",
      immutable: true,
    },
    maintenanceDate: { type: Date, required: true, default: Date.now },
    engineerName: { type: String, trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    remarks: { type: String, trim: true },
    status: {
      type: String,
      enum: ["In Progress", "Completed"],
      default: "Completed",
    },
    finalStatus: {
      type: String,
      enum: ["Good", "Attention Required", "Needs Repair", "Out of Service"],
    },
    approvalStatus: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected"],
      default: "Submitted",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    nextMaintenanceDate: { type: Date },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
    photos: { type: [String], default: [] },

    // Component inspections
    components: {
      compressorOil: { type: inspectionSubSchema },
      oilFilter: { type: inspectionSubSchema },
      airFilter: { type: inspectionSubSchema },
      oilSeparator: { type: oilSeparatorSubSchema },
      separatorElement: { type: inspectionSubSchema },
      coolant: { type: coolantSubSchema },
    },

    sparesUsed: { type: [sparePartUsedSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

compressorMaintenanceSchema.index({ machine: 1, maintenanceDate: -1 });
compressorMaintenanceSchema.index({ nextMaintenanceDate: 1, reminderSent: 1 });

module.exports = mongoose.model("CompressorMaintenance", compressorMaintenanceSchema);