/*
 * Daily MongoDB backup to JSON files.
 *
 * Exports every registered mongoose collection to backups/<yyyy-mm-dd>.json.
 * Old backups are pruned so only the newest BACKUP_KEEP (default 14) remain.
 * Runs once at startup and once per day via node-cron when the backend is run
 * locally (never on serverless).
 */

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const mongoose = require("mongoose");

const BACKUP_DIR = path.resolve(__dirname, "..", "backups");
const KEEP = Number(process.env.BACKUP_KEEP || 14);
const backupHour = String(process.env.BACKUP_HOUR || 1).padStart(2, "0");
const backupMinute = String(process.env.BACKUP_MINUTE || 0).padStart(2, "0");

function pruneOld(keepDir) {
  const files = fs
    .readdirSync(keepDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  while (files.length > KEEP) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(keepDir, oldest));
    console.log(`[backup] pruned ${oldest}`);
  }
}

async function createBackup() {
  if (mongoose.connection.readyState !== 1) {
    console.error("[backup] mongoose not connected - skipping");
    return { done: false, reason: "not connected" };
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const data = { createdAt: new Date().toISOString(), collections: {} };

  for (const name of mongoose.connection.modelNames()) {
    try {
      const collName = mongoose.model(name).collection?.name || name;
      const rows = await mongoose.connection.db.collection(collName).find({}).toArray();
      data.collections[name] = rows;
    } catch (err) {
      console.error(`[backup] failed exporting ${name}:`, err.message);
    }
  }

  const file = path.join(BACKUP_DIR, `${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  pruneOld(BACKUP_DIR);
  const count = Object.keys(data.collections).length;
  console.log(`[backup] wrote ${file} (${count} collections)`);
  return { done: true, file, collections: count };
}

function startBackup() {
  if (String(process.env.BACKUP_ENABLED || "true").toLowerCase() === "false") return;
  // Run once shortly after boot so the backup is validated, then daily.
  setTimeout(() => createBackup().catch((err) => console.error("[backup] error:", err)), 15000);
  cron.schedule(`${backupMinute} ${backupHour} * * *`, () => {
    createBackup().catch((err) => console.error("[backup] error:", err));
  });
  console.log(`[backup] daily backup scheduled at ${backupHour}:${backupMinute} (keep ${KEEP})`);
}

module.exports = { createBackup, startBackup };