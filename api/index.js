const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("../config/mongoDns");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const connectDB = require("../config/db");
const { notFound, errorHandler } = require("../middleware/errorHandler");
const { requireSchedulerKey } = require("../middleware/auth");
const { runDailyChecks } = require("../utils/scheduler");
const { startScheduler } = require("../utils/scheduler");
const { startBackup } = require("../utils/backup");

connectDB();

const app = express();

// Mobile Flutter clients do not need CORS, but browsers (including Flutter Web)
// do. Reflect the request origin so development and deployed web clients work
// with credentialed requests. `*` cannot be used together with credentials.
const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isLocalDevelopmentOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin(origin, callback) {
      // Requests from native apps/Postman have no Origin header. When no
      // CLIENT_URL is configured, allow browser clients from any origin.
      if (
        !origin ||
        configuredOrigins.length === 0 ||
        configuredOrigins.includes(origin) ||
        isLocalDevelopmentOrigin(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);
// Raised from the 100kb default so requests containing base64-encoded
// images/files in the JSON body (e.g. SparePart.photo) aren't rejected.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// Routes
app.use("/api/auth", require("../routes/authRoutes"));
app.use("/api/employees", require("../routes/employeeRoutes"));
app.use("/api/machines", require("../routes/machineRoutes"));
app.use("/api/maintenance", require("../routes/maintenanceRoutes"));
app.use("/api/oil-changes", require("../routes/oilChangeRoutes"));
app.use("/api/spare-parts", require("../routes/sparePartRoutes"));
app.use("/api/maintenance-jobs", require("../routes/maintenanceJobRoutes"));
app.use("/api/notifications", require("../routes/notificationRoutes"));
app.use("/api/dashboard", require("../routes/dashboardRoutes"));
app.use("/api/reports", require("../routes/reportRoutes"));
app.use("/api/leaves", require("../routes/leaveRoutes"));
app.use("/api/upload", require("../routes/uploadRoutes"));
app.use("/api/compressor-maintenance", require("../routes/compressorMaintenanceRoutes"));
app.use("/api/air-dryer-maintenance", require("../routes/airDryerMaintenanceRoutes"));
app.use("/api/work-logs", require("../routes/workLogRoutes"));

// One-shot scheduler test endpoint — POST /api/scheduler/run
app.post("/api/scheduler/run", requireSchedulerKey, async (req, res, next) => {
  try {
    const result = await runDailyChecks();
    res.json({ success: true, message: "Scheduler run completed", ...result });
  } catch (err) {
    next(err);
  }
});

const healthResponse = (req, res) =>
  res.json({ success: true, message: "MMS API is running" });

app.get("/", healthResponse);
app.get("/api/health", healthResponse);

app.use(notFound);
app.use(errorHandler);

// Vercel invokes the exported Express app. Keep a local listener only when
// this file is run directly for development.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  // In-process daily reminders + backups (local only, never on Vercel).
  startScheduler();
  startBackup();
}

module.exports = app;
