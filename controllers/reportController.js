const asyncHandler = require("express-async-handler");
const Report = require("../models/Report");
const Machine = require("../models/Machine");
const Maintenance = require("../models/Maintenance");
const MaintenanceJob = require("../models/MaintenanceJob");
const OilChange = require("../models/OilChange");
const SparePart = require("../models/SparePart");
const Employee = require("../models/Employee");

const getMonthRange = (month) => {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { start, end };
};

const formatDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "-");

const pdfEscape = (value) => String(value ?? "")
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)")
  .replace(/[^\x20-\x7E]/g, "?");

// Creates a small dependency-free PDF for the monthly report download endpoint.
const buildPdf = (report) => {
  const snapshot = report.historySnapshot || {};
  const machine = report.machine || {};
  const lines = [
    "MACHINE MAINTENANCE MONTHLY REPORT",
    `Machine: ${machine.machineName || "-"} (${machine.machineNumber || "-"})`,
    `Company: ${machine.company || "-"}`,
    `Period: ${formatDate(report.dateRangeStart)} to ${formatDate(new Date(report.dateRangeEnd).getTime() - 86400000)}`,
    `Submitted: ${formatDate(report.createdAt)}`,
    "",
    "MAINTENANCE RECORDS",
  ];

  (snapshot.maintenance || []).forEach((item) => {
    lines.push(`${formatDate(item.maintenanceDate)} | ${item.maintenanceType || "-"} | ${item.description || item.remarks || "-"} | Cost: ${item.cost || 0}`);
    if (item.maintenanceCategory && item.maintenanceCategory !== "General") {
      lines.push(`  Components: ${(item.componentsChecked || []).join(", ") || "-"} | Engineer: ${item.engineerName || "-"} | Status: ${item.finalStatus || "-"}`);
      if (item.inspectionDetails) lines.push(`  Inspection: ${JSON.stringify(item.inspectionDetails)}`);
      (item.sparePartsDetails || []).forEach((part) => {
        lines.push(`  Spare: ${part.name || "-"} | Part: ${part.partNumber || "-"} | Qty: ${part.quantity || 0} | Total: ${part.totalCost || 0}`);
      });
    }
  });
  if (!snapshot.maintenance?.length) lines.push("No maintenance records for this month.");

  lines.push("", "MAINTENANCE JOBS");
  (snapshot.jobs || []).forEach((item) => {
    lines.push(`${formatDate(item.createdAt)} | ${item.whyStopped || "-"} | Status: ${item.jobStatus || "-"} | Total cost: ${item.totalCost || 0}`);
  });
  if (!snapshot.jobs?.length) lines.push("No maintenance jobs for this month.");

  lines.push("", "OIL CHANGES");
  (snapshot.oilChanges || []).forEach((item) => {
    lines.push(`${formatDate(item.oilChangeDate)} | ${item.oilType || "-"} | Quantity: ${item.oilQuantity || 0} | Next: ${formatDate(item.nextOilChangeDate)}`);
  });
  if (!snapshot.oilChanges?.length) lines.push("No oil changes for this month.");

  lines.push("", "SPARE PART REPLACEMENTS");
  (snapshot.spareParts || []).forEach((item) => {
    lines.push(`${formatDate(item.replacementDate)} | ${item.spareName || "-"} | Qty: ${item.quantity || 0} | Cost: ${item.price || 0} | ${item.reason || "-"}`);
  });
  if (!snapshot.spareParts?.length) lines.push("No spare part replacements for this month.");

  const wrappedLines = lines.flatMap((line) => {
    if (!line) return [""];
    const chunks = [];
    for (let index = 0; index < line.length; index += 105) chunks.push(line.slice(index, index + 105));
    return chunks;
  });
  const pageLines = 48;
  const pages = [];
  for (let index = 0; index < wrappedLines.length; index += pageLines) pages.push(wrappedLines.slice(index, index + pageLines));

  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((page, index) => {
    const pageNumber = 4 + index * 2;
    const contentNumber = pageNumber + 1;
    const content = ["BT", "/F1 10 Tf", "45 760 Td", "14 TL", ...page.map((line) => `(${pdfEscape(line)}) Tj T*`), "ET"].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
};

// @desc  Request a report. This just records the request; the Python service
//        picks it up (or is called synchronously via its own HTTP endpoint)
//        to actually render the PDF/Excel/CSV and then PATCHes fileUrl back.
// @route POST /api/reports
const requestReport = asyncHandler(async (req, res) => {
  const { machine: machineId, month } = req.body;
  const range = getMonthRange(month);
  if (!range) {
    res.status(400);
    throw new Error("A valid report month is required");
  }

  const machine = await Machine.findOne({ _id: machineId, isDeleted: false }).lean();
  const employee = await Employee.findOne({ user: req.user._id, isActive: true }).lean();
  if (!machine || !employee?.assignedMachines.some((id) => String(id) === String(machineId))) {
    res.status(403);
    throw new Error("You can only report on machines assigned to you");
  }

  const dateQuery = { $gte: range.start, $lt: range.end };
  const [maintenance, jobs, oilChanges, spareParts] = await Promise.all([
    Maintenance.find({ machine: machineId, maintenanceDate: dateQuery }).lean(),
    MaintenanceJob.find({ machine: machineId, createdAt: dateQuery }).lean(),
    OilChange.find({ machine: machineId, oilChangeDate: dateQuery }).lean(),
    SparePart.find({ machine: machineId, replacementDate: dateQuery }).lean(),
  ]);

  const report = await Report.create({
    reportType: "Monthly",
    generatedBy: req.user._id,
    machine: machineId,
    dateRangeStart: range.start,
    dateRangeEnd: range.end,
    filters: { month },
    format: "pdf",
    status: "Submitted",
    submittedTo: ["general_manager", "owner"],
    historySnapshot: { maintenance, jobs, oilChanges, spareParts },
  });
  res.status(201).json({ success: true, data: report });
});

const getReports = asyncHandler(async (req, res) => {
  const query = req.user.role === "employee"
    ? { generatedBy: req.user._id }
    : req.user.role === "admin"
      ? {}
      : { submittedTo: req.user.role };
  if (req.query.company) {
    const ids = await Machine.find({ company: req.query.company }).distinct("_id");
    query.machine = { $in: ids };
  }
  const reports = await Report.find(query)
    .populate("machine", "machineName machineNumber company")
    .populate("generatedBy", "name email")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: reports });
});

const downloadReport = asyncHandler(async (req, res) => {
  const query = req.user.role === "employee"
    ? { _id: req.params.id, generatedBy: req.user._id }
    : req.user.role === "admin"
      ? { _id: req.params.id }
    : { _id: req.params.id, submittedTo: req.user.role };
  const report = await Report.findOne(query).populate("machine", "machineName machineNumber company");
  if (!report) {
    res.status(404);
    throw new Error("Report not found");
  }
  const filename = `machine-report-${report.machine?.machineNumber || report._id}-${formatDate(report.dateRangeStart)}.pdf`;
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` });
  res.send(buildPdf(report));
});

const deleteReport = asyncHandler(async (req, res) => {
  const query = req.user.role === "employee"
    ? { _id: req.params.id, generatedBy: req.user._id }
    : req.user.role === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, submittedTo: req.user.role };
  const report = await Report.findOne(query);
  if (!report) {
    res.status(404);
    throw new Error("Report not found or you are not permitted to delete it");
  }
  await report.deleteOne();
  res.json({ success: true, message: "Report deleted" });
});

// @desc  Python service calls this once the file is generated
// @route PATCH /api/reports/:id/complete
// @access Scheduler (x-scheduler-key)
const completeReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Report not found");
  }
  report.fileUrl = req.body.fileUrl;
  await report.save();
  res.json({ success: true, data: report });
});

module.exports = { requestReport, getReports, downloadReport, deleteReport, completeReport };
