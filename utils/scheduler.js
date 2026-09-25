/*
 * In-process daily scheduler for MMS reminders.
 *
 * Replaces the external Python APScheduler process so reminders run every day
 * even when no scheduler window is left open next to the backend. Runs:
 *   1. Oil-change reminder dispatch for records due today / overdue.
 *   2. Maintenance reminder dispatch for records due today / overdue.
 *   3. Marks each record's reminderSent so nothing re-fires the next day.
 *   4. Writes in-app Notification rows so employees/owners see the reminder.
 *
 * External SMS/WhatsApp/Email are dispatched by utils/notifications.js and
 * fall back to logging when credentials are not configured.
 */

const cron = require("node-cron");
const OilChange = require("../models/OilChange");
const Maintenance = require("../models/Maintenance");
const Notification = require("../models/Notification");
const Employee = require("../models/Employee");
const User = require("../models/User");
const { sendSms, sendWhatsApp, sendEmail } = require("./notifications");

const OWNER_EMAIL = process.env.SCHEDULER_OWNER_EMAIL;
const OWNER_PHONE = process.env.SCHEDULER_OWNER_PHONE;

const log = (...args) => console.log(new Date().toISOString(), "-", ...args);

const dueDetails = (doc) => {
  const machine = doc.machine || {};
  return {
    id: String(doc._id),
    machine, // populated machine w/ assignedEmployees
    machineName: machine.machineName || "Unknown machine",
    machineNumber: machine.machineNumber || "",
    machineId: machine._id ? String(machine._id) : undefined,
    assignedEmployees: machine.assignedEmployees || [],
  };
};

async function ensureInAppNotification({ type, title, message, machineId, sourceCollection, sourceId }) {
  const exists = await Notification.exists({
    type,
    sourceCollection,
    sourceId: sourceId ? String(sourceId) : undefined,
  });
  if (exists) return;

  const employees = await Employee.find({
    ...(machineId ? { assignedMachines: machineId } : {}),
    isActive: true,
  }).select("user");
  const owners = await User.find({ role: "owner", isActive: true }).select("_id");

  const recipients = [];
  for (const emp of employees) if (emp.user) recipients.push({ user: emp.user, channel: "push" });
  for (const owner of owners) recipients.push({ user: owner._id, channel: "push" });

  await Notification.create({
    type,
    title,
    message,
    ...(machineId ? { machine: machineId } : {}),
    recipients,
    sourceCollection,
    sourceId,
  });
}

async function processOilChanges() {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = await OilChange.find({
    nextOilChangeDate: { $lte: endOfToday },
    reminderSent: false,
  });
  const withMachines = await OilChange.populate(due, {
    path: "machine",
    populate: { path: "assignedEmployees", select: "name phoneNumber email" },
  });

  log(`Oil change: ${withMachines.length} reminder(s) due`);
  for (const record of withMachines) {
    const d = dueDetails(record);
    const message =
      `Machine: ${d.machineName} (${d.machineNumber})\n` +
      `Oil Change Due Today\nPlease replace the oil immediately.`;

    for (const emp of d.assignedEmployees) {
      if (emp.phoneNumber) {
        const sms = await sendSms(emp.phoneNumber, message);
        const wa = await sendWhatsApp(emp.phoneNumber, message);
        log(`Oil change -> ${emp.name} SMS:${sms.status} WhatsApp:${wa.status}`);
      }
      if (emp.email) {
        const mail = await sendEmail(emp.email, `Oil Change Due - ${d.machineName}`, message);
        log(`Oil change -> ${emp.email} Email:${mail.status}`);
      }
    }

    if (OWNER_EMAIL) await sendEmail(OWNER_EMAIL, `Oil Change Due - ${d.machineName}`, message);
    if (OWNER_PHONE) {
      const sms = await sendSms(OWNER_PHONE, message);
      log(`Oil change -> owner SMS:${sms.status}`);
    }

    await ensureInAppNotification({
      type: "Oil Change Reminder",
      title: `Oil Change Due - ${d.machineName}`,
      message,
      machineId: d.machineId,
      sourceCollection: "OilChange",
      sourceId: record._id,
    });

    record.reminderSent = true;
    record.reminderSentAt = new Date();
    await record.save({ validateBeforeSave: false });
    log(`Oil change reminder marked sent: ${d.id} (${d.machineName})`);
  }
}

async function processMaintenance() {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = await Maintenance.find({
    nextMaintenanceDate: { $lte: endOfToday, $ne: null },
    reminderSent: false,
  });
  const withMachines = await Maintenance.populate(due, {
    path: "machine",
    populate: { path: "assignedEmployees", select: "name phoneNumber email" },
  });

  log(`Maintenance: ${withMachines.length} reminder(s) due`);
  for (const record of withMachines) {
    const d = dueDetails(record);
    const message =
      `Machine: ${d.machineName}\n` +
      `Scheduled maintenance is due today.\n` +
      `Please perform the required maintenance and log it in the system.`;

    for (const emp of d.assignedEmployees) {
      if (emp.phoneNumber) {
        const sms = await sendSms(emp.phoneNumber, message);
        const wa = await sendWhatsApp(emp.phoneNumber, message);
        log(`Maintenance -> ${emp.name} SMS:${sms.status} WhatsApp:${wa.status}`);
      }
      if (emp.email) {
        const mail = await sendEmail(emp.email, `Maintenance Due - ${d.machineName}`, message);
        log(`Maintenance -> ${emp.email} Email:${mail.status}`);
      }
    }

    if (OWNER_EMAIL) await sendEmail(OWNER_EMAIL, `Maintenance Due - ${d.machineName}`, message);

    await ensureInAppNotification({
      type: "Upcoming Maintenance",
      title: `Maintenance Due - ${d.machineName}`,
      message,
      machineId: d.machineId,
      sourceCollection: "Maintenance",
      sourceId: record._id,
    });

    record.reminderSent = true;
    record.reminderSentAt = new Date();
    await record.save({ validateBeforeSave: false });
    log(`Maintenance reminder marked sent: ${d.id} (${d.machineName})`);
  }
}

async function runDailyChecks() {
  log("=== Daily reminder check started ===");
  try {
    await processOilChanges();
  } catch (err) {
    console.error("[scheduler] oil-change pass failed:", err);
  }
  try {
    await processMaintenance();
  } catch (err) {
    console.error("[scheduler] maintenance pass failed:", err);
  }
  log("=== Daily reminder check complete ===");
  return { done: true };
}

/**
 * Start the cron jobs for reminders + backup. Only meaningful in a local,
 * long-running server process (never on serverless/Vercel).
 */
function startScheduler() {
  if (String(process.env.SCHEDULER_ENABLED || "true").toLowerCase() === "false") {
    log("Scheduler disabled (SCHEDULER_ENABLED=false)");
    return;
  }

  const hour = String(process.env.SCHEDULER_HOUR || 8).padStart(2, "0");
  const minute = String(process.env.SCHEDULER_MINUTE || 0).padStart(2, "0");

  cron.schedule(`${minute} ${hour} * * *`, () => {
    runDailyChecks().catch((err) => console.error("[scheduler] daily run error:", err));
  });
  log(`Daily reminder cron scheduled at ${hour}:${minute}`);
}

module.exports = { runDailyChecks, startScheduler };