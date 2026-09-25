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

const refrigerantSubSchema = {
  checked: { type: Boolean, default: false },
  levelPressure: { type: String, enum: ["Low", "Normal", "High"] },
  condition: { type: String, enum: ["Good", "Leaking", "Needs Refill", "Replace"] },
  notes: { type: String, trim: true },
  photos: { type: [String], default: [] },
  serviceDate: { type: Date },
  nextServiceDate: { type: Date },
};

const airDryerMaintenanceSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },
    maintenanceType: {
      type: String,
      default: "Air Dryer Maintenance",
      immutable: true,
    },
    maintenanceDate: { type: Date, required: true, default: Date.now },
    engineerName: { type: String, trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    inspectionStatus: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "In Progress",
    },
    remarks: { type: String, trim: true },
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
      airFilter: { type: inspectionSubSchema },
      moistureSeparator: { type: inspectionSubSchema },
      coolant: { type: inspectionSubSchema },
      refrigerant: { type: refrigerantSubSchema },
    },

    sparesUsed: { type: [sparePartUsedSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

airDryerMaintenanceSchema.index({ machine: 1, maintenanceDate: -1 });
airDryerMaintenanceSchema.index({ nextMaintenanceDate: 1, reminderSent: 1 });

module.exports = mongoose.model("AirDryerMaintenance", airDryerMaintenanceSchema);