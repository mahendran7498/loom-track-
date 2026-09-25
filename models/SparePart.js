const mongoose = require("mongoose");

const sparePartSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },
    spareName: { type: String, required: true, trim: true },
    spareNumber: { type: String, trim: true },
    company: { type: String, trim: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
    replacementDate: { type: Date, required: true, default: Date.now },
    warrantyExpiry: { type: Date },
    reason: { type: String, trim: true },
    photo: { type: String },
    invoiceFile: { type: String },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

sparePartSchema.index({ machine: 1, replacementDate: -1 });

module.exports = mongoose.model("SparePart", sparePartSchema);
