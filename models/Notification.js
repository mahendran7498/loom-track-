const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "Upcoming Maintenance",
        "Oil Change Reminder",
        "Warranty Expiry",
        "Spare Replacement Reminder",
        "Machine Breakdown",
        "Employee Update",
        "Compressor Maintenance",
        "Air Dryer Maintenance",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    machine: { type: mongoose.Schema.Types.ObjectId, ref: "Machine" },
    recipients: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        channel: {
          type: String,
          enum: ["sms", "whatsapp", "email", "push"],
        },
        status: {
          type: String,
          enum: ["pending", "sent", "failed"],
          default: "pending",
        },
        sentAt: { type: Date },
        error: { type: String },
      },
    ],
    isRead: { type: Boolean, default: false },
    sourceCollection: { type: String }, // e.g. "OilChange", "Maintenance"
    sourceId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
