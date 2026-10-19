const PlanFactManifest = {
  id: "plan-fact",
  role: "module",
  title: "План/Факт",
  icon: "plan-fact",
  version: "0.1.0",
  status: "active",
  entry: "./index.js",
  menu: { section: "main", label: "План/Факт", order: 12 },
  company: { enabledByDefault: true },
  routes: ["/plan-fact", "/plan-fact/:subTab"],
  defaultRoute: "/plan-fact"
};
const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/;
function toScaled(value) {
  const match = DECIMAL_RE.exec(String(value).trim());
  if (!match) throw new Error(`[decimal] не десятичная строка: «${value}»`);
  const fraction = match[3] ?? "";
  return {
    sign: match[1] === "-" ? -1n : 1n,
    digits: BigInt(match[2] + fraction),
    scale: fraction.length
  };
}
function scaledToString(sign, digits, scale) {
  let text2 = digits.toString();
  if (scale > 0) {
    text2 = text2.padStart(scale + 1, "0");
    const cut = text2.length - scale;
    text2 = `${text2.slice(0, cut)}.${text2.slice(cut)}`;
    text2 = text2.replace(/\.?0+$/, "");
    if (text2.endsWith(".")) text2 = text2.slice(0, -1);
    if (!text2) text2 = "0";
  }
  return sign < 0n && text2 !== "0" ? `-${text2}` : text2;
}
function parseDecimalInput(raw) {
  if (raw === null || raw === void 0 || typeof raw === "boolean") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? normalizeDecimal(String(raw)) : null;
  let text2 = String(raw).replace(/\u00a0/g, " ").trim();
  if (!text2 || /^[-–—]+$/.test(text2)) return null;
  text2 = text2.replace(/\s/g, "").replace(/%$/, "");
  const hasComma = text2.includes(",");
  const hasDot = text2.includes(".");
  if (hasComma && hasDot) {
    text2 = text2.lastIndexOf(",") > text2.lastIndexOf(".") ? text2.replace(/\./g, "").replace(",", ".") : text2.replace(/,/g, "");
  } else if (hasComma) {
    text2 = text2.replace(",", ".");
  }
  return normalizeDecimal(text2);
}
function normalizeDecimal(value) {
  const match = DECIMAL_RE.exec(String(value).trim());
  if (!match) return null;
  const scaled = toScaled(String(value).trim());
  return scaledToString(scaled.sign, scaled.digits, scaled.scale);
}
function isDecimal(value) {
  return typeof value === "string" && DECIMAL_RE.test(value.trim());
}
function addDecimal(left, right) {
  const a = toScaled(left);
  const b = toScaled(right);
  const scale = Math.max(a.scale, b.scale);
  const aDigits = a.sign * a.digits * 10n ** BigInt(scale - a.scale);
  const bDigits = b.sign * b.digits * 10n ** BigInt(scale - b.scale);
  const sum = aDigits + bDigits;
  return scaledToString(sum < 0n ? -1n : 1n, sum < 0n ? -sum : sum, scale);
}
function sumDecimal(values) {
  return values.reduce((acc, value) => addDecimal(acc, value), "0");
}
function compareDecimal(left, right) {
  const diff = addDecimal(left, `-${normalizeDecimal(right) ?? right}`);
  const scaled = toScaled(diff);
  const value = scaled.sign * scaled.digits;
  return value === 0n ? 0 : value > 0n ? 1 : -1;
}
function formatDecimal(value, fractionDigits) {
  const scaled = toScaled(value);
  const negative = scaled.sign < 0n;
  let digits = scaled.digits.toString();
  let intPart;
  let fracPart;
  if (scaled.scale === 0) {
    intPart = digits;
    fracPart = "";
  } else {
    digits = digits.padStart(scaled.scale + 1, "0");
    const cut = digits.length - scaled.scale;
    intPart = digits.slice(0, cut);
    fracPart = digits.slice(cut);
  }
  if (fractionDigits !== void 0) {
    if (fractionDigits <= 0) {
      const next = fracPart[fractionDigits] ?? "0";
      if (Number(next) >= 5) intPart = addDecimal(intPart, "1");
      fracPart = "";
    } else {
      fracPart = (fracPart + "0".repeat(fractionDigits)).slice(0, fractionDigits);
    }
  } else {
    fracPart = fracPart.replace(/0+$/, "");
  }
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = negative && (intPart !== "0" || /[1-9]/.test(fracPart)) ? "−" : "";
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}
function divideDecimal(left, right, scale = 3) {
  const a = toScaled(left);
  const b = toScaled(right);
  if (b.digits === 0n) throw new Error("[decimal] деление на ноль");
  const numerator = a.digits * 10n ** BigInt(b.scale + scale);
  const denominator = b.digits * 10n ** BigInt(a.scale);
  const quotient = (numerator * 2n + denominator) / (denominator * 2n);
  return scaledToString(a.sign * b.sign, quotient, scale);
}
function floorDecimal(value) {
  const scaled = toScaled(value);
  const integer = scaled.digits / 10n ** BigInt(scaled.scale);
  const hasFraction = scaled.digits % 10n ** BigInt(scaled.scale) !== 0n;
  const floored = scaled.sign < 0n && hasFraction ? integer + 1n : integer;
  return scaledToString(scaled.sign < 0n && floored !== 0n ? -1n : 1n, floored, 0);
}
function ceilDecimal(value) {
  const scaled = toScaled(value);
  const integer = scaled.digits / 10n ** BigInt(scaled.scale);
  const hasFraction = scaled.digits % 10n ** BigInt(scaled.scale) !== 0n;
  const ceiled = scaled.sign > 0n && hasFraction ? integer + 1n : integer;
  return scaledToString(scaled.sign < 0n && ceiled !== 0n ? -1n : 1n, ceiled, 0);
}
function scaleByPowerOfTen(value, power) {
  if (!Number.isInteger(power)) throw new Error(`[decimal] степень должна быть целой: ${power}`);
  const scaled = toScaled(value);
  const scale = scaled.scale - power;
  if (scale >= 0) return scaledToString(scaled.sign, scaled.digits, scale);
  return scaledToString(scaled.sign, scaled.digits * 10n ** BigInt(-scale), 0);
}
function maxDecimal(values) {
  return values.reduce((acc, value) => compareDecimal(value, acc) > 0 ? value : acc, values[0] ?? "0");
}
function decimalToNumber(value) {
  return Number(value);
}
const PLAN_FACT_CALENDAR_STORE = "PLAN_FACT_CALENDAR";
const CALENDAR_RECORD_ID = "company";
const DATE_RE$1 = /^\d{4}-\d{2}-\d{2}$/;
function services$8() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$a() {
  var _a, _b;
  const stores = (_b = (_a = services$8().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a);
  const name = stores == null ? void 0 : stores.PLAN_FACT_CALENDAR;
  if (!name) throw new Error("Сторадж PLAN_FACT_CALENDAR не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function normalizeNonWorkingDays(input) {
  if (!Array.isArray(input)) return [];
  const unique = /* @__PURE__ */ new Set();
  for (const value of input) {
    const text2 = String(value ?? "").trim();
    if (DATE_RE$1.test(text2)) unique.add(text2);
  }
  return [...unique].sort();
}
function emptyCalendar() {
  return { id: CALENDAR_RECORD_ID, workWeek: 5, nonWorkingDays: [], updatedAt: "", updatedBy: "" };
}
async function loadCalendar() {
  const storage2 = services$8().storage;
  if (!storage2 || typeof storage2.get !== "function") return emptyCalendar();
  try {
    const raw = await storage2.get(storeName$a(), CALENDAR_RECORD_ID);
    if (!raw) return emptyCalendar();
    return {
      id: CALENDAR_RECORD_ID,
      workWeek: [5, 6, 7].includes(Number(raw.workWeek)) ? Number(raw.workWeek) : 5,
      nonWorkingDays: normalizeNonWorkingDays(raw.nonWorkingDays),
      updatedAt: String(raw.updatedAt ?? ""),
      updatedBy: String(raw.updatedBy ?? "")
    };
  } catch (_error) {
    return emptyCalendar();
  }
}
async function saveCalendar(workWeek, nonWorkingDays) {
  const permissions = services$8().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
  const record = {
    id: CALENDAR_RECORD_ID,
    workWeek: [5, 6, 7].includes(Number(workWeek)) ? Number(workWeek) : 5,
    nonWorkingDays: normalizeNonWorkingDays(nonWorkingDays),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor,
    syncStatus: "pending"
  };
  const storage2 = services$8().storage;
  if (storage2 && typeof storage2.put === "function") await storage2.put(storeName$a(), record);
  return record;
}
const PLAN_FACT_QUANTITIES_STORE = "PLAN_FACT_QUANTITIES";
const CONTOURS = [
  { kind: "RD", label: "По рабочей документации", short: "РД", hint: "Объём по РД — исходные данные проектирования" },
  { kind: "CONTRACT", label: "По договору", short: "Договор", hint: "Договорный объём: основание оплаты, менять его нельзя" },
  { kind: "PROPOSED", label: "Предложено ПТО", short: "Предложено", hint: "Производственный объём, который ПТО предлагает РП" },
  { kind: "APPROVED", label: "Утверждено РП", short: "Утверждено", hint: "Утверждённый производственный объём (после baseline неизменяем)" },
  { kind: "CUSTOMER_ACCEPTED", label: "Принято заказчиком", short: "Принято", hint: "Объём из подписанного акта; вводится вручную по документу" }
];
function services$7() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$9() {
  var _a, _b, _c;
  const name = (_c = (_b = (_a = services$7().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)) == null ? void 0 : _c.PLAN_FACT_QUANTITIES;
  if (!name) throw new Error("Сторадж PLAN_FACT_QUANTITIES не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function newId$4() {
  var _a;
  const generator = (_a = services$7().storage) == null ? void 0 : _a.generateId;
  return typeof generator === "function" ? generator("pfqty") : `pfqty_${Date.now().toString(36)}`;
}
function canManageContours() {
  const permissions = services$7().permissions;
  return !!(permissions && typeof permissions.canManageContours === "function" && permissions.canManageContours());
}
async function listContours(objectId) {
  var _a, _b;
  const all2 = await ((_b = (_a = services$7().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$9())) ?? [];
  return all2.filter((record) => record.objectId === objectId && !record.isDeleted);
}
async function setContour(input) {
  if (!canManageContours()) {
    return { ok: false, error: "Объёмы по контурам ведёт ПТО: у вашей роли нет этого права" };
  }
  const storage2 = services$7().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const raw = String(input.quantity ?? "").trim();
  if (raw === "") {
    const cleared = await clearContour(input.worItemId, input.kind);
    return cleared.ok ? { ok: true, record: null } : cleared;
  }
  const quantity = normalizeDecimal(raw.replace(",", "."));
  if (!isDecimal(quantity)) return { ok: false, error: "Объём должен быть числом" };
  if (quantity.startsWith("-")) {
    return { ok: false, error: "Отрицательный объём допустим только как отдельная корректировка, а не запись в контур" };
  }
  const permissions = services$7().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
  const existing = await storage2.getAll(storeName$9());
  const current = existing.find((record2) => record2.worItemId === input.worItemId && record2.kind === input.kind && !record2.isDeleted) ?? null;
  const record = {
    id: (current == null ? void 0 : current.id) ?? newId$4(),
    worItemId: input.worItemId,
    objectId: input.objectId,
    kind: input.kind,
    quantity,
    source: String(input.source ?? (current == null ? void 0 : current.source) ?? "").trim(),
    method: String(input.method ?? (current == null ? void 0 : current.method) ?? "").trim(),
    note: String(input.note ?? "").trim(),
    updatedBy: actor,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  };
  await storage2.put(storeName$9(), record);
  return { ok: true, record };
}
async function clearContour(worItemId, kind) {
  if (!canManageContours()) {
    return { ok: false, error: "Объёмы по контурам ведёт ПТО: у вашей роли нет этого права" };
  }
  const storage2 = services$7().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const all2 = await storage2.getAll(storeName$9());
  const current = all2.find((record) => record.worItemId === worItemId && record.kind === kind && !record.isDeleted);
  if (!current) return { ok: true };
  await storage2.put(storeName$9(), {
    ...current,
    isDeleted: true,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  });
  return { ok: true };
}
function subtract(left, right) {
  if (left === null || right === null) return null;
  return addDecimal(left, right.startsWith("-") ? right.slice(1) : `-${right}`);
}
function buildContourRows(worRows, contours) {
  const byItem = /* @__PURE__ */ new Map();
  for (const record of contours) {
    const list = byItem.get(record.worItemId) ?? [];
    list.push(record);
    byItem.set(record.worItemId, list);
  }
  return worRows.map((row) => {
    const values = {
      RD: null,
      CONTRACT: null,
      PROPOSED: null,
      APPROVED: null,
      CUSTOMER_ACCEPTED: null
    };
    for (const record of byItem.get(row.id) ?? []) {
      if (record.kind in values) values[record.kind] = record.quantity;
    }
    const filled = CONTOURS.filter((contour) => values[contour.kind] !== null).length;
    return {
      worItemId: row.id,
      place: [row.floor, row.place].filter(Boolean).join(" · "),
      workRaw: row.workRaw,
      workId: row.workId ?? null,
      unit: row.unit || row.unitRaw || "",
      plan: row.quantity,
      values,
      filled,
      proposedMinusContract: subtract(values.PROPOSED, values.CONTRACT),
      incomplete: filled < CONTOURS.length
    };
  });
}
function contourCompletion(rows) {
  let complete = 0;
  let partial = 0;
  let empty = 0;
  for (const row of rows) {
    if (row.filled === 0) empty += 1;
    else if (row.incomplete) partial += 1;
    else complete += 1;
  }
  return { total: rows.length, complete, partial, empty, incomplete: rows.length - complete };
}
const PLAN_FACT_PROPOSALS_STORE = "PLAN_FACT_PROPOSALS";
const PLAN_FACT_PROPOSAL_ROWS_STORE = "PLAN_FACT_PROPOSAL_ROWS";
const PLAN_FACT_BASELINES_STORE = "PLAN_FACT_BASELINES";
const PLAN_FACT_CHANGE_REQUESTS_STORE = "PLAN_FACT_CHANGE_REQUESTS";
const PLAN_FACT_AUDIT_STORE = "PLAN_FACT_AUDIT";
function services$6() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$8(key) {
  var _a, _b;
  const name = (_b = (_a = services$6().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу, чтобы применилась миграция`);
  return name;
}
function newId$3(prefix) {
  var _a;
  const generator = (_a = services$6().storage) == null ? void 0 : _a.generateId;
  return typeof generator === "function" ? generator(prefix) : `${prefix}_${Date.now().toString(36)}`;
}
function author$1() {
  const permissions = services$6().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
}
function canApproveContours() {
  const permissions = services$6().permissions;
  return !!(permissions && typeof permissions.canApproveContours === "function" && permissions.canApproveContours());
}
function canPropose() {
  const permissions = services$6().permissions;
  return !!(permissions && typeof permissions.canManageContours === "function" && permissions.canManageContours());
}
async function all(key) {
  var _a, _b;
  return await ((_b = (_a = services$6().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$8(key))) ?? [];
}
async function writeAudit(entry) {
  const storage2 = services$6().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return null;
  const record = {
    id: newId$3("pfaudit"),
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    actor: entry.actor ?? author$1(),
    reason: entry.reason ?? "",
    beforeValue: entry.beforeValue ?? null,
    afterValue: entry.afterValue ?? null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  };
  await storage2.put(storeName$8(PLAN_FACT_AUDIT_STORE), record);
  return record;
}
async function listAudit(limit = 30) {
  const records = await all(PLAN_FACT_AUDIT_STORE);
  return records.filter((record) => record && !record.isDeleted).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, limit);
}
async function listProposals(objectId) {
  const records = await all(PLAN_FACT_PROPOSALS_STORE);
  return records.filter((record) => record && !record.isDeleted && (!objectId || record.objectId === objectId)).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}
async function listProposalRows(proposalId) {
  const records = await all(PLAN_FACT_PROPOSAL_ROWS_STORE);
  return records.filter((record) => record && !record.isDeleted && record.proposalId === proposalId);
}
async function listBaselines(objectId) {
  const records = await all(PLAN_FACT_BASELINES_STORE);
  return records.filter((record) => record && record.objectId === objectId).sort((left, right) => String(left.approvedAt).localeCompare(String(right.approvedAt)));
}
function currentBaseline(baselines) {
  return baselines.length > 0 ? baselines[baselines.length - 1] : null;
}
async function listChangeRequests(objectId) {
  const records = await all(PLAN_FACT_CHANGE_REQUESTS_STORE);
  return records.filter((record) => record && !record.isDeleted && (!objectId || record.objectId === objectId)).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}
async function proposeContours(input) {
  if (!canPropose()) return { ok: false, error: "Предложение готовит ПТО: у вашей роли нет права на правку объёмов" };
  const storage2 = services$6().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const rows = input.rows.filter((row) => String(row.quantity ?? "").trim() !== "");
  if (rows.length === 0) {
    return { ok: false, error: "Нечего предлагать: сначала заполните контур «Предложено ПТО»" };
  }
  const negative = rows.find((row) => String(row.quantity).trim().startsWith("-"));
  if (negative) return { ok: false, error: "Отрицательный объём в предложение не попадает" };
  const pending = (await listProposals(input.objectId)).find((proposal) => proposal.status === "submitted");
  if (pending) {
    return { ok: false, error: `Уже есть предложение на утверждении (${pending.title || pending.id}): дождитесь решения РП` };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    id: newId$3("pfprop"),
    objectId: input.objectId,
    title: String(input.title ?? "").trim() || `Предложение от ${now.slice(0, 10)}`,
    status: "submitted",
    submittedBy: author$1(),
    submittedAt: now,
    decidedBy: "",
    decidedAt: null,
    decisionReason: String(input.note ?? ""),
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending"
  };
  await storage2.put(storeName$8(PLAN_FACT_PROPOSALS_STORE), record);
  for (const row of rows) {
    const rowRecord = {
      id: newId$3("pfprow"),
      proposalId: record.id,
      worItemId: row.worItemId,
      quantity: String(row.quantity).trim(),
      note: String(row.note ?? "").trim(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending"
    };
    await storage2.put(storeName$8(PLAN_FACT_PROPOSAL_ROWS_STORE), rowRecord);
  }
  await writeAudit({
    entity: "proposal",
    entityId: record.id,
    action: "propose",
    afterValue: { title: record.title, rows: rows.length, note: record.decisionReason }
  });
  return { ok: true, record };
}
async function decideProposal(input) {
  if (!canApproveContours()) return { ok: false, error: "Утверждает объёмы РП: у вашей роли нет этого права" };
  const storage2 = services$6().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const proposal = (await listProposals()).find((record) => record.id === input.proposalId);
  if (!proposal) return { ok: false, error: "Предложение не найдено" };
  if (proposal.status !== "submitted") {
    return { ok: false, error: `Решение уже принято: статус «${proposal.status}»` };
  }
  const rows = await listProposalRows(proposal.id);
  if (rows.length === 0) return { ok: false, error: "В предложении нет строк" };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const reason = String(input.reason ?? "").trim();
  if (input.decision === "rejected" && reason === "") {
    return { ok: false, error: "Для отказа нужна причина — иначе ПТО не поймёт, что менять" };
  }
  await storage2.put(storeName$8(PLAN_FACT_PROPOSALS_STORE), {
    ...proposal,
    status: input.decision,
    decidedBy: author$1(),
    decidedAt: now,
    decisionReason: reason || proposal.decisionReason,
    updatedAt: now,
    syncStatus: "pending"
  });
  await writeAudit({
    entity: "proposal",
    entityId: proposal.id,
    action: input.decision === "approved" ? "approve" : "reject",
    reason,
    beforeValue: { status: "submitted" },
    afterValue: { status: input.decision, rows: rows.length }
  });
  if (input.decision === "rejected") return { ok: true };
  const snapshotRows = rows.map((row) => ({
    worItemId: row.worItemId,
    quantity: row.quantity,
    contour: "APPROVED",
    workRaw: "",
    place: "",
    unit: ""
  }));
  const baseline = {
    id: newId$3("pfbase"),
    objectId: proposal.objectId,
    proposalId: proposal.id,
    approvedBy: author$1(),
    approvedAt: now,
    snapshot: { rows: snapshotRows, note: reason, revision: 1 },
    createdAt: now,
    syncStatus: "pending"
  };
  await storage2.put(storeName$8(PLAN_FACT_BASELINES_STORE), baseline);
  for (const row of snapshotRows) {
    await setContour({
      worItemId: row.worItemId,
      objectId: proposal.objectId,
      kind: "APPROVED",
      quantity: row.quantity,
      source: "baseline",
      method: "утверждение РП",
      note: `baseline ${baseline.id}`
    });
  }
  await writeAudit({
    entity: "baseline",
    entityId: baseline.id,
    action: "create",
    afterValue: { proposalId: proposal.id, rows: snapshotRows.length }
  });
  return { ok: true, baseline };
}
async function requestChange(input) {
  var _a;
  if (!canPropose()) return { ok: false, error: "Изменение запрашивает ПТО: у вашей роли нет права на правку объёмов" };
  const storage2 = services$6().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const reason = String(input.reason ?? "").trim();
  if (reason === "") return { ok: false, error: "Причина изменения обязательна" };
  const qtyAfter = String(input.qtyAfter ?? "").trim();
  if (qtyAfter === "") return { ok: false, error: "Укажите новый объём (пустое значение — это не изменение)" };
  const baselines = await listBaselines(input.objectId);
  const baseline = currentBaseline(baselines);
  if (!baseline) {
    return { ok: false, error: "Утверждённого baseline нет: сначала утвердите предложение" };
  }
  const before = ((_a = baseline.snapshot.rows.find((row) => row.worItemId === input.worItemId && row.contour === input.kind)) == null ? void 0 : _a.quantity) ?? null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    id: newId$3("pfchange"),
    objectId: input.objectId,
    baselineId: baseline.id,
    worItemId: input.worItemId,
    quantityKind: input.kind,
    qtyBefore: before,
    qtyAfter,
    reason,
    status: "created",
    createdBy: author$1(),
    createdAt: now,
    checkedBy: "",
    decidedBy: "",
    decidedAt: null,
    effectiveAt: null,
    updatedAt: now,
    workRaw: String(input.workRaw ?? ""),
    place: String(input.place ?? ""),
    syncStatus: "pending"
  };
  await storage2.put(storeName$8(PLAN_FACT_CHANGE_REQUESTS_STORE), record);
  await writeAudit({
    entity: "change_request",
    entityId: record.id,
    action: "create",
    reason,
    beforeValue: { quantity: before },
    afterValue: { quantity: qtyAfter }
  });
  return { ok: true, record };
}
async function decideChangeRequest(input) {
  if (!canApproveContours()) return { ok: false, error: "Утверждает изменения РП: у вашей роли нет этого права" };
  const storage2 = services$6().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const record = (await listChangeRequests()).find((item) => item.id === input.id);
  if (!record) return { ok: false, error: "Запрос на изменение не найден" };
  if (record.status !== "created" && record.status !== "checked") {
    return { ok: false, error: `Решение уже принято: статус «${record.status}»` };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const reason = String(input.reason ?? "").trim();
  if (input.decision === "rejected" && reason === "") {
    return { ok: false, error: "Для отказа нужна причина" };
  }
  if (input.decision === "rejected") {
    await storage2.put(storeName$8(PLAN_FACT_CHANGE_REQUESTS_STORE), {
      ...record,
      status: "rejected",
      decidedBy: author$1(),
      decidedAt: now,
      decisionReason: reason,
      updatedAt: now,
      syncStatus: "pending"
    });
    await writeAudit({
      entity: "change_request",
      entityId: record.id,
      action: "reject",
      reason,
      beforeValue: { status: record.status },
      afterValue: { status: "rejected" }
    });
    return { ok: true };
  }
  const baselines = await listBaselines(record.objectId);
  const previous = currentBaseline(baselines);
  if (!previous) return { ok: false, error: "Действующий baseline не найден" };
  const rows = previous.snapshot.rows.map((row) => row.worItemId === record.worItemId && row.contour === record.quantityKind ? { ...row, quantity: record.qtyAfter } : row);
  const known = rows.some((row) => row.worItemId === record.worItemId && row.contour === record.quantityKind);
  if (!known) {
    rows.push({
      worItemId: record.worItemId,
      quantity: record.qtyAfter,
      contour: record.quantityKind,
      workRaw: record.workRaw,
      place: record.place,
      unit: ""
    });
  }
  const baseline = {
    id: newId$3("pfbase"),
    objectId: record.objectId,
    proposalId: previous.proposalId,
    approvedBy: author$1(),
    approvedAt: now,
    snapshot: {
      rows,
      note: `Изменение: ${record.reason}`,
      revision: (previous.snapshot.revision ?? 1) + 1
    },
    createdAt: now,
    syncStatus: "pending"
  };
  await storage2.put(storeName$8(PLAN_FACT_BASELINES_STORE), baseline);
  await setContour({
    worItemId: record.worItemId,
    objectId: record.objectId,
    kind: "APPROVED",
    quantity: record.qtyAfter,
    source: "change_request",
    method: "изменение утверждено РП",
    note: record.reason
  });
  await storage2.put(storeName$8(PLAN_FACT_CHANGE_REQUESTS_STORE), {
    ...record,
    status: "effective",
    decidedBy: author$1(),
    decidedAt: now,
    effectiveAt: now,
    updatedAt: now,
    syncStatus: "pending"
  });
  await writeAudit({
    entity: "change_request",
    entityId: record.id,
    action: "approve",
    reason: record.reason,
    beforeValue: { quantity: record.qtyBefore, revision: previous.snapshot.revision ?? 1 },
    afterValue: { quantity: record.qtyAfter, revision: baseline.snapshot.revision, baselineId: baseline.id }
  });
  return { ok: true, baseline };
}
function baselineDiff(baseline, rows) {
  if (!baseline) return [];
  const result = [];
  for (const row of rows) {
    for (const snapshot of baseline.snapshot.rows) {
      if (snapshot.worItemId !== row.worItemId) continue;
      const current = row.values[snapshot.contour] ?? null;
      if (current !== snapshot.quantity) {
        result.push({
          worItemId: row.worItemId,
          kind: snapshot.contour,
          approved: snapshot.quantity,
          current
        });
      }
    }
  }
  return result;
}
const EMPTY$1 = "";
function normalizeUnit(raw, units) {
  var _a;
  const text2 = String(raw ?? EMPTY$1).trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!text2) return null;
  const squash = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/\./g, "").replace(/²/g, "2").replace(/³/g, "3");
  const target = squash(text2);
  for (const unit of units) {
    if (squash(unit.title) === target) return unit.code;
    if ((_a = unit.aliases) == null ? void 0 : _a.some((alias) => squash(alias) === target)) return unit.code;
  }
  return null;
}
function normalizeLabel(raw) {
  return raw.toLowerCase().replace(/ё/g, "е").replace(/[«»"'`]/g, "").replace(/\s+/g, " ").trim();
}
function parseLocationContext(context, rules) {
  const parts = [];
  const unmatched = [];
  for (const label of context) {
    let matched = false;
    for (const rule of rules) {
      const re = new RegExp(rule.pattern, "i");
      const match = re.exec(label);
      if (match) {
        const value = rule.group !== void 0 && match[rule.group] ? match[rule.group] : label.trim();
        parts.push({ type: rule.target, name: value });
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(label);
  }
  return { parts, unmatched };
}
function matchWork(raw, ctx) {
  const key = normalizeLabel(raw);
  if (!key) return { workId: null, match: "unresolved", reason: "пустое наименование" };
  const exact = ctx.works.find((work) => normalizeLabel(work.title) === key);
  if (exact) return { workId: exact.id, match: "auto", reason: "точное совпадение" };
  const alias = ctx.aliases.find((entry) => entry.aliasNormalized === key || normalizeLabel(entry.alias) === key);
  if (alias) return { workId: alias.workId, match: "auto", reason: "алиас" };
  const byCode = ctx.works.find((work) => work.code.toLowerCase() === key);
  if (byCode) return { workId: byCode.id, match: "auto", reason: "код работы" };
  return { workId: null, match: "unresolved", reason: "нет совпадения в каталоге" };
}
function cellByField(row, columns, field2) {
  const mapping = columns.find((column) => column.field === field2);
  if (!mapping || mapping.columnIndex < 1 || mapping.columnIndex > row.cells.length) return null;
  return { index: mapping.columnIndex, value: row.cells[mapping.columnIndex - 1] };
}
function normalizeRow(row, ctx) {
  const issues = [];
  const fragment = (column, rawValue) => ({
    sheet: row.sheet,
    row: row.rowNumber,
    column,
    rawValue: rawValue === null || rawValue === void 0 ? null : String(rawValue)
  });
  const nameCell = cellByField(row, ctx.columns, "name");
  const name = nameCell ? String(nameCell.value ?? EMPTY$1).trim() : EMPTY$1;
  if (!name) {
    return { item: null, issues: [], isMaterial: false };
  }
  if (row.marker === "М") return { item: null, issues: [], isMaterial: true };
  const quantityCell = cellByField(row, ctx.columns, "quantity");
  const quantity = quantityCell ? parseDecimalInput(quantityCell.value) : null;
  if (quantity === null) {
    issues.push({
      severity: "error",
      code: "NO_QUANTITY",
      message: `Объём не распознан: «${quantityCell ? String(quantityCell.value ?? "") : "колонка не найдена"}»`,
      fragment: fragment((quantityCell == null ? void 0 : quantityCell.index) ?? null, (quantityCell == null ? void 0 : quantityCell.value) ?? null)
    });
  } else if (quantity.startsWith("-")) {
    issues.push({
      severity: "error",
      code: "NEGATIVE_QUANTITY",
      message: "Отрицательный объём допустим только как отдельная корректировка",
      fragment: fragment((quantityCell == null ? void 0 : quantityCell.index) ?? null, quantity)
    });
  }
  const unitCell = cellByField(row, ctx.columns, "unit");
  const unitRaw = unitCell ? String(unitCell.value ?? EMPTY$1).trim() : EMPTY$1;
  const unit = normalizeUnit(unitRaw, ctx.units);
  if (!unit) {
    issues.push({
      severity: "warning",
      code: "UNKNOWN_UNIT",
      message: `Единица измерения не распознана: «${unitRaw || "пусто"}»`,
      fragment: fragment((unitCell == null ? void 0 : unitCell.index) ?? null, unitRaw)
    });
  }
  const work = matchWork(name, ctx);
  if (work.match === "unresolved") {
    issues.push({
      severity: "warning",
      code: "WORK_UNRESOLVED",
      message: `Вид работ не сопоставлен (${work.reason}): «${name}»`,
      fragment: fragment((nameCell == null ? void 0 : nameCell.index) ?? null, name)
    });
  }
  const location = parseLocationContext(row.locationContext, ctx.locationRules);
  let locationParts = location.parts.map((part) => part.name);
  let columnRoles;
  if (locationParts.length === 0) {
    const floorCell = cellByField(row, ctx.columns, "section_floor");
    const placeCell = cellByField(row, ctx.columns, "location_label");
    const floor = floorCell ? String(floorCell.value ?? EMPTY$1).trim() : EMPTY$1;
    const place = placeCell ? String(placeCell.value ?? EMPTY$1).trim() : EMPTY$1;
    const fromColumns = [floor, place].filter((value) => value !== EMPTY$1);
    if (fromColumns.length > 0) {
      locationParts = fromColumns;
      location.unmatched.length = 0;
      columnRoles = { floor: floor || void 0, place: place || void 0 };
    }
  }
  if (location.unmatched.length > 0) {
    issues.push({
      severity: "warning",
      code: "LOCATION_UNRESOLVED",
      message: `Не разобраны уровни локации: ${location.unmatched.map((item) => `«${item}»`).join(", ")}`,
      fragment: fragment(null, location.unmatched.join(" | "))
    });
  }
  return {
    item: {
      rowNumber: row.rowNumber,
      locationPath: locationParts,
      locationRoles: columnRoles,
      workRaw: name,
      workId: work.workId,
      workMatch: work.match,
      unitRaw,
      unit,
      quantity,
      fragment: fragment((nameCell == null ? void 0 : nameCell.index) ?? null, name)
    },
    issues,
    isMaterial: false
  };
}
function dedupeItems(items) {
  const seen = /* @__PURE__ */ new Map();
  const duplicates = [];
  for (const item of items) {
    const key = `${item.locationPath.map(normalizeLabel).join("/")}|${normalizeLabel(item.workRaw)}|${item.unit ?? "?"}`;
    if (seen.has(key)) duplicates.push(item);
    else seen.set(key, item);
  }
  return { items: [...seen.values()], duplicates };
}
function normalizeRows(rows, ctx) {
  const items = [];
  const issues = [];
  let materialsSkipped = 0;
  let unresolvedWorks2 = 0;
  let unresolvedLocations = 0;
  for (const row of rows) {
    const result = normalizeRow(row, ctx);
    if (result.isMaterial) materialsSkipped += 1;
    issues.push(...result.issues);
    unresolvedWorks2 += result.issues.filter((issue) => issue.code === "WORK_UNRESOLVED").length;
    unresolvedLocations += result.issues.filter((issue) => issue.code === "LOCATION_UNRESOLVED").length;
    if (result.item) items.push(result.item);
  }
  const deduped = dedupeItems(items);
  for (const duplicate of deduped.duplicates) {
    issues.push({
      severity: "warning",
      code: "DUPLICATE_ROW",
      message: `Дубль позиции (${duplicate.locationPath.join("/")} · ${duplicate.workRaw}) — строка не создаёт новую позицию`,
      fragment: duplicate.fragment
    });
  }
  return {
    layout: "unknown",
    items: deduped.items,
    issues,
    stats: {
      rowsTotal: rows.length,
      imported: deduped.items.length,
      unresolvedWorks: unresolvedWorks2,
      unresolvedLocations,
      materialsSkipped
    }
  };
}
const UNITS = [
  { code: "m2", title: "м²", aliases: ["м2", "м²", "кв.м", "кв. м", "M2", "S, м2"] },
  { code: "m3", title: "м³", aliases: ["м3", "м³", "куб.м", "S, м3"] },
  { code: "pcs", title: "шт", aliases: ["шт", "шт.", "штук", "Штук."] },
  { code: "kg", title: "кг", aliases: ["кг", "кг.", "kg"] },
  { code: "t", title: "т", aliases: ["т", "тонн"] },
  { code: "l", title: "л", aliases: ["л", "л.", "литр"] },
  { code: "lm", title: "пог. м", aliases: ["пог.м", "пог. м", "м.п", "м.п.", "мп", "п.м", "п. м.", "п.м.", "м.пог.", "м.пог"] },
  { code: "set", title: "компл.", aliases: ["компл.", "компл", "комплект"] },
  { code: "complex", title: "комплекс", aliases: ["комплекс", "комп.", "комплекс работ"] }
];
function unitCodeOf(title) {
  const found = UNITS.find((unit) => {
    var _a;
    return unit.title === title || ((_a = unit.aliases) == null ? void 0 : _a.includes(title));
  });
  return (found == null ? void 0 : found.code) ?? "complex";
}
const CATALOG_SEED = [
  { key: "styazhka", name: "Устройство фиброцементной стяжки", unit: "м2", group: "Полы", stage: "черновые" },
  { key: "shtukaturka", name: "Штукатурка стен", unit: "м2", group: "Стены", stage: "черновые" },
  { key: "otkosy", name: "Откосы", unit: "м.п.", group: "Проёмы", stage: "чистовые" },
  { key: "potolok_gkl", name: "Подшивной потолок (ГКЛ)", unit: "м2", group: "Потолки", stage: "черновые" },
  { key: "shpaklevka", name: "Шпаклёвка стен", unit: "м2", group: "Стены", stage: "черновые" },
  { key: "plitka_sten", name: "Облицовка стен керамогранитом (с/у)", unit: "м2", group: "Стены", stage: "чистовые" },
  { key: "dekor", name: "Декоративная штукатурка", unit: "м2", group: "Стены", stage: "чистовые" },
  { key: "okraska", name: "Окраска стен", unit: "м2", group: "Стены", stage: "чистовые" },
  { key: "oboi", name: "Оклейка стен обоями", unit: "м2", group: "Стены", stage: "чистовые" },
  { key: "plitka_pola", name: "Укладка керамогранитных плит (с/у)", unit: "м2", group: "Полы", stage: "чистовые" },
  { key: "natyazhnoy", name: "Устройство натяжных ПВХ потолков", unit: "м2", group: "Потолки", stage: "чистовые" },
  { key: "laminat", name: "Устройство покрытия пола из ламината", unit: "м2", group: "Полы", stage: "чистовые" },
  { key: "plintus", name: "Плинтус", unit: "м.п.", group: "Отделка", stage: "чистовые" },
  { key: "porogi", name: "Пороги (в с/у)", unit: "м.п.", group: "Проёмы", stage: "чистовые" },
  { key: "plitka_balkon", name: "Плитка балкон", unit: "м2", group: "Полы", stage: "чистовые" }
];
const WORKS = CATALOG_SEED.map((seed) => ({
  id: seed.key,
  code: seed.key,
  title: seed.name,
  unit: unitCodeOf(seed.unit),
  group: seed.group ?? null,
  stage: seed.stage ?? null
}));
const SYNONYM_ALIASES = [
  // заголовки колонок обмерной матрицы
  ["штукатурка гипсовая 10-20мм", "shtukaturka"],
  ["штукатурка гипсовая 10-20 мм", "shtukaturka"],
  ["штукатурка гипсовая", "shtukaturka"],
  ["штукатурка цеметная", "shtukaturka"],
  ["штукатурка цементно", "shtukaturka"],
  ["шпаклёвка", "shpaklevka"],
  ["шпаклевка", "shpaklevka"],
  ["обои", "oboi"],
  ["окраска обои", "okraska"],
  ["окраска декоративной", "okraska"],
  ["плинтус", "plintus"],
  ["ламинат", "laminat"],
  ["натяжной потолок", "natyazhnoy"],
  ["подшивной потолок", "potolok_gkl"],
  ["плитка стен су", "plitka_sten"],
  ["плитка стен", "plitka_sten"],
  ["плитка пола су", "plitka_pola"],
  ["плитка пола", "plitka_pola"],
  ["пороги", "porogi"],
  ["плитка балкон", "plitka_balkon"],
  ["откосы s", "otkosy"],
  ["декоративная", "dekor"],
  // полные формулировки формы «ФКП, 142»
  ["окраска потолков в 2 слоя, с подготовкой основания:", "okraska"],
  ["окраска стен в 2 слоя, с подготовкой основания", "okraska"],
  ["окраска оконных откосов в 2 слоя, с подготовкой основания", "okraska"],
  ["окраска порогов балконов в 2 слоя, с подготовкой основания", "okraska"],
  ["оклейка стен обоями по подготовленной поверхности:", "oboi"],
  ["оклейка дверных откосов обоями по подготовленной поверхности:", "oboi"],
  ["установка плинтуса из пвх на клею, высотой 55 мм:", "plintus"],
  ["установка порогов на стыках помещений:", "porogi"],
  ["монтаж подоконных досок из пвх:", "otkosy"],
  ["устройство натяжных потолков:", "natyazhnoy"],
  ["устройство финишной отделки пола линолеумом:", "laminat"],
  ["устройство финишной отделки пола керамогранитными плитами по подготовленной поверхности с заполнением швов затиркой:", "plitka_pola"],
  ["устройство выравнивающего наливного пола толщ. до 5 мм под линолеум, с подготовкой основания", "styazhka"],
  ["оштукатуривание поверхности порогов балконов смесями на цементной основе (ср. толщ.слоя 15 мм), с подготовкой основания", "shpaklevka"],
  ["шпатлевка поверхности порогов балконов (ср. толщ.слоя 2 мм), с подготовкой основания", "shpaklevka"],
  ["монтаж ревизионных лючков в с/у", null]
];
const WORK_ALIASES = SYNONYM_ALIASES.filter((entry) => entry[1] !== null).map(([alias, workId]) => ({ alias, aliasNormalized: normalizeLabel(alias), workId }));
const WORK_RULES = [
  ["r-plaster", "shtukaturka", /штукатур|оштукатур/i, "штукатурные работы"],
  ["r-putty", "shpaklevka", /шпатл|шпакл|финишн\w*\s+шпаклевк/i, "шпаклёвочные работы"],
  ["r-tile-floor", "plitka_pola", /керамогранит\w*\s*плит|плитк\w*\s+пол|пол\w*\s+керамогранит/i, "облицовка пола керамогранитом"],
  ["r-laminate-floor", "laminat", /ламинат|линолеум/i, "покрытие пола из ламината"],
  ["r-skirting", "plintus", /плинтус/i, "установка плинтуса"],
  ["r-threshold", "porogi", /порог/i, "пороги"],
  ["r-slope", "otkosy", /откос|подоконн/i, "откосы и подоконники"],
  ["r-paint", "okraska", /окраск|окрас/i, "окрасочные работы"],
  ["r-wallpaper", "oboi", /обои|обоя|обоев|обой/i, "оклейка обоями"],
  ["r-ceiling-hanging", "natyazhnoy", /натяжн\w*\s+потолок/i, "натяжные потолки"],
  ["r-ceiling-gkl", "potolok_gkl", /подшивн\w*\s+потолок/i, "подшивные потолки"],
  ["r-no-screed", null, /наливн/i, "наливной пол"],
  ["r-no-hatch", null, /лючк/i, "ревизионные лючки"]
];
function matchReason(rawWork, workId) {
  const key = normalizeLabel(rawWork);
  const exact = SYNONYM_ALIASES.find(([alias]) => normalizeLabel(alias) === key);
  if (exact) {
    return exact[1] === null ? "формулировка формы знакома, но такого вида работ нет в справочнике" : `точный синоним «${exact[0].slice(0, 40)}»`;
  }
  const rule = WORK_RULES.find(([, , pattern]) => pattern.test(rawWork));
  if (!rule) return "нет совпадения в справочнике";
  const [, workKey, , note] = rule;
  if (workKey === null) return `похоже на «${note}», но такого вида работ нет в справочнике`;
  if (workId === null) return `по правилу «${note}» — вид работ не сопоставлен`;
  return `по правилу «${note}»`;
}
const NORM_SEED = [
  ["styazhka", "40", 6, "7", 5, true],
  ["shtukaturka", "60", 4, "3", 10, true],
  ["otkosy", "10", 4, "0", 15, true],
  ["potolok_gkl", "25", 2, "1", 20, false],
  ["shpaklevka", "50", 6, "1", 25, true],
  ["plitka_sten", "6", 9, "0", 30, true],
  ["dekor", "25", 4, "1", 35, false],
  ["okraska", "50", 6, "0", 40, true],
  ["oboi", "80", 6, "0", 40, true],
  ["plitka_pola", "5", 6, "0", 45, true],
  ["natyazhnoy", "40", 4, "0", 50, true],
  ["laminat", "40", 6, "0", 55, true],
  ["plintus", "60", 4, "0", 60, false],
  ["porogi", "30", 4, "0", 65, false],
  ["plitka_balkon", "5", 4, "0", 70, false]
];
const WORK_NORMS = NORM_SEED.reduce((acc, seed) => {
  const [key, norm, crew, lag, rank, confirmed] = seed;
  const work = WORKS.find((item) => item.id === key);
  if (!work) return acc;
  acc[key] = { key, name: work.title, unit: work.unit, norm, crew, lag, rank, confirmed };
  return acc;
}, {});
const PLAN_FACT_WORKS_STORE = "PLAN_FACT_WORKS";
const PLAN_FACT_WORK_ALIASES_STORE = "PLAN_FACT_WORK_ALIASES";
function services$5() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$7(key) {
  var _a, _b;
  const name = (_b = (_a = services$5().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу, чтобы применилась миграция`);
  return name;
}
function canManageWorks() {
  const permissions = services$5().permissions;
  return !!(permissions && typeof permissions.canManageWorks === "function" && permissions.canManageWorks());
}
function normalizeWorkName(raw) {
  return String(raw ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
}
function newId$2(prefix) {
  var _a;
  const generator = (_a = services$5().storage) == null ? void 0 : _a.generateId;
  return typeof generator === "function" ? generator(prefix) : `${prefix}_${Date.now().toString(36)}`;
}
function seedWorks() {
  return WORKS.map((work) => ({
    id: work.id,
    code: work.code,
    name: work.title,
    unit: String(work.unit),
    stage: work.stage ?? "",
    groupName: work.group ?? "",
    calcRule: "",
    revision: 1,
    isActive: true,
    source: "builtin",
    createdBy: "",
    updatedAt: ""
  }));
}
async function listWorks() {
  var _a, _b;
  const stored = await ((_b = (_a = services$5().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$7(PLAN_FACT_WORKS_STORE))) ?? [];
  const byId = /* @__PURE__ */ new Map();
  for (const work of seedWorks()) byId.set(work.id, work);
  for (const record of stored) {
    if (!record || !record.id) continue;
    if (record.isDeleted) {
      byId.delete(record.id);
      continue;
    }
    byId.set(record.id, record);
  }
  return [...byId.values()].filter((work) => work.isActive !== false).sort((left, right) => String(left.groupName ?? "").localeCompare(String(right.groupName ?? ""), "ru") || String(left.name ?? "").localeCompare(String(right.name ?? ""), "ru"));
}
async function listAliases() {
  var _a, _b;
  const stored = await ((_b = (_a = services$5().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$7(PLAN_FACT_WORK_ALIASES_STORE))) ?? [];
  return stored.filter((alias) => alias && !alias.isDeleted);
}
function author() {
  const permissions = services$5().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
}
async function saveWork(input) {
  if (!canManageWorks()) return { ok: false, error: "Справочник работ ведёт ПТО: у вашей роли нет этого права" };
  const storage2 = services$5().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Название вида работ обязательно" };
  if (!String(input.unit ?? "").trim()) return { ok: false, error: "Укажите единицу измерения" };
  const works = await listWorks();
  const normalized = normalizeWorkName(name);
  const duplicate = works.find((work) => work.id !== input.id && normalizeWorkName(work.name) === normalized);
  if (duplicate) return { ok: false, error: `Такой вид работ уже есть: «${duplicate.name}»` };
  const current = input.id ? works.find((work) => work.id === input.id) : null;
  const record = {
    id: (current == null ? void 0 : current.id) ?? input.id ?? newId$2("pfwork"),
    code: String(input.code ?? (current == null ? void 0 : current.code) ?? "").trim(),
    name,
    unit: String(input.unit),
    stage: String(input.stage ?? (current == null ? void 0 : current.stage) ?? "").trim(),
    groupName: String(input.groupName ?? (current == null ? void 0 : current.groupName) ?? "").trim(),
    calcRule: String(input.calcRule ?? (current == null ? void 0 : current.calcRule) ?? "").trim(),
    revision: ((current == null ? void 0 : current.revision) ?? 0) + 1,
    isActive: true,
    source: "pto",
    createdBy: (current == null ? void 0 : current.createdBy) || author(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  };
  await storage2.put(storeName$7(PLAN_FACT_WORKS_STORE), record);
  return { ok: true, record };
}
async function archiveWork(id) {
  if (!canManageWorks()) return { ok: false, error: "Справочник работ ведёт ПТО: у вашей роли нет этого права" };
  const storage2 = services$5().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const works = await listWorks();
  const current = works.find((work) => work.id === id);
  if (!current) return { ok: false, error: "Вид работ не найден" };
  await storage2.put(storeName$7(PLAN_FACT_WORKS_STORE), {
    ...current,
    isDeleted: true,
    revision: current.revision + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  });
  return { ok: true };
}
async function saveAlias(aliasRaw, workId, source = "pto") {
  if (!canManageWorks()) return { ok: false, error: "Связки работ ведёт ПТО: у вашей роли нет этого права" };
  const storage2 = services$5().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const alias = String(aliasRaw ?? "").trim();
  const normalizedAlias = normalizeWorkName(alias);
  if (!alias || !normalizedAlias) return { ok: false, error: "Пустое название связать нельзя" };
  const works = await listWorks();
  if (!works.some((work) => work.id === workId)) {
    return { ok: false, error: "Вид работ не найден в справочнике" };
  }
  const existing = (await listAliases()).find((record2) => record2.normalizedAlias === normalizedAlias);
  const record = {
    id: (existing == null ? void 0 : existing.id) ?? newId$2("pfalias"),
    workId,
    alias,
    normalizedAlias,
    source,
    createdBy: author(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  };
  await storage2.put(storeName$7(PLAN_FACT_WORK_ALIASES_STORE), record);
  return { ok: true, record };
}
async function removeAlias(id) {
  if (!canManageWorks()) return { ok: false, error: "Связки работ ведёт ПТО: у вашей роли нет этого права" };
  const storage2 = services$5().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const current = (await listAliases()).find((record) => record.id === id);
  if (!current) return { ok: true };
  await storage2.put(storeName$7(PLAN_FACT_WORK_ALIASES_STORE), {
    ...current,
    isDeleted: true,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  });
  return { ok: true };
}
async function buildCatalog() {
  const works = await listWorks();
  const aliases = await listAliases();
  const byId = new Map(works.map((work) => [work.id, work]));
  const byNormalizedAlias = /* @__PURE__ */ new Map();
  for (const alias of aliases) {
    if (byId.has(alias.workId)) byNormalizedAlias.set(alias.normalizedAlias, alias.workId);
  }
  return { works, aliases, byId, byNormalizedAlias };
}
function catalogToNormalizeContext(catalog, builtinAliases) {
  return {
    works: catalog.works.map((work) => ({
      id: work.id,
      code: work.code || work.id,
      title: work.name,
      // Единица в справочнике выбирается из справочника единиц (в интерфейсе ПТО), поэтому
      // приведение к каноническому коду безопасно; пустая единица останется пустой строкой.
      unit: work.unit,
      group: work.groupName || null,
      stage: work.stage || null
    })),
    aliases: [
      ...catalog.aliases.map((alias) => ({
        alias: alias.alias,
        aliasNormalized: alias.normalizedAlias,
        workId: alias.workId
      })),
      ...builtinAliases
    ]
  };
}
function matchInCatalog(rawName, catalog) {
  const normalized = normalizeWorkName(rawName);
  if (!normalized) return { workId: null, matchedBy: "none" };
  const byAlias = catalog.byNormalizedAlias.get(normalized);
  if (byAlias && catalog.byId.has(byAlias)) return { workId: byAlias, matchedBy: "alias" };
  for (const work of catalog.works) {
    if (normalizeWorkName(work.name) === normalized) return { workId: work.id, matchedBy: "name" };
  }
  return { workId: null, matchedBy: "none" };
}
const PLAN_FACT_FACTS_STORE = "PLAN_FACT_FACTS";
function services$4() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$6() {
  var _a, _b;
  const stores = (_b = (_a = services$4().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a);
  const name = stores == null ? void 0 : stores.PLAN_FACT_FACTS;
  if (!name) throw new Error("Сторадж PLAN_FACT_FACTS не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function canRecordFact() {
  const permissions = services$4().permissions;
  return !!(permissions && typeof permissions.canRecordFact === "function" && permissions.canRecordFact());
}
function currentAuthor$1() {
  const permissions = services$4().permissions;
  if (permissions && typeof permissions.getCurrentEngineerName === "function") {
    return String(permissions.getCurrentEngineerName() || "Прораб");
  }
  return "Прораб";
}
function newId$1() {
  var _a;
  const generator = (_a = services$4().storage) == null ? void 0 : _a.generateId;
  if (typeof generator === "function") return generator("pffact");
  return `pffact_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validate(input) {
  const quantity = normalizeDecimal(String(input.quantity ?? "").replace(",", "."));
  if (!quantity) return { ok: false, error: "Объём факта должен быть числом" };
  if (quantity.startsWith("-") || quantity === "0") {
    return { ok: false, error: "Объём факта должен быть больше нуля (уменьшение оформляется корректировкой)" };
  }
  if (!DATE_RE.test(String(input.factDate ?? ""))) return { ok: false, error: "Укажите дату выполнения" };
  if (!input.workRaw || !String(input.workRaw).trim()) return { ok: false, error: "Не выбрана работа" };
  return { ok: true, quantity };
}
async function recordFact(input) {
  if (!canRecordFact()) return { ok: false, error: "Факт вносит прораб: у вашей роли нет этого права" };
  const checked = validate(input);
  if (!checked.ok) return checked;
  const storage2 = services$4().storage;
  if (!storage2 || typeof storage2.put !== "function") return { ok: false, error: "Сервис storage недоступен" };
  const record = {
    id: newId$1(),
    objectId: input.objectId,
    section: input.section,
    floor: input.floor,
    place: input.place,
    workKey: input.workKey,
    workRaw: input.workRaw,
    unit: input.unit,
    quantity: checked.quantity,
    factDate: input.factDate,
    comment: String(input.comment ?? "").trim(),
    author: currentAuthor$1(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "pending",
    correctsId: null,
    supersededBy: null,
    revision: 1,
    syncStatus: "pending"
  };
  await storage2.put(storeName$6(), record);
  return { ok: true, record };
}
async function correctFact(originalId, patch) {
  if (!canRecordFact()) return { ok: false, error: "Факт вносит прораб: у вашей роли нет этого права" };
  const storage2 = services$4().storage;
  if (!storage2 || typeof storage2.put !== "function" || typeof storage2.getAll !== "function") {
    return { ok: false, error: "Сервис storage недоступен" };
  }
  const all2 = await storage2.getAll(storeName$6());
  const original = all2.find((record) => record.id === originalId);
  if (!original) return { ok: false, error: "Исходная запись факта не найдена" };
  if (original.supersededBy) return { ok: false, error: "Эта запись уже исправлена более поздней корректировкой" };
  const checked = validate({ ...original, quantity: patch.quantity, factDate: patch.factDate ?? original.factDate });
  if (!checked.ok) return checked;
  const corrected = {
    ...original,
    id: newId$1(),
    quantity: checked.quantity,
    factDate: patch.factDate ?? original.factDate,
    comment: String(patch.comment ?? "").trim() || original.comment,
    author: currentAuthor$1(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "pending",
    correctsId: original.id,
    supersededBy: null,
    revision: original.revision + 1,
    syncStatus: "pending"
  };
  await storage2.put(storeName$6(), corrected);
  const replaced = { ...original, supersededBy: corrected.id, syncStatus: "pending" };
  await storage2.put(storeName$6(), replaced);
  return { ok: true, record: corrected, replaced };
}
async function listFacts(objectId) {
  var _a, _b;
  const all2 = await ((_b = (_a = services$4().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$6())) ?? [];
  return all2.filter((record) => record.objectId === objectId).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}
function activeFacts(records) {
  return records.filter((record) => !record.supersededBy);
}
function percentOf(fact, plan) {
  if (plan === "0" || plan.startsWith("-")) return null;
  const share = divideDecimal(fact, plan, 8);
  return formatDecimal(scaleByPowerOfTen(share, 2), 2);
}
function buildPlanFactSummary(worRows, factRows, options = {}) {
  const active = activeFacts(factRows);
  const groups = /* @__PURE__ */ new Map();
  const keyOf = (floor, workKey) => `${floor}|${workKey}`;
  for (const row of worRows) {
    const workKey = row.workId ?? `raw:${row.workRaw}`;
    const key = keyOf(row.floor, workKey);
    const existing = groups.get(key);
    if (existing) existing.plan = addDecimal(existing.plan, row.quantity);
    else {
      groups.set(key, {
        floor: row.floor,
        workKey,
        workRaw: row.workRaw,
        unit: row.unitRaw || row.unit || "",
        plan: row.quantity,
        fact: "0",
        deviation: row.quantity,
        percent: null
      });
    }
  }
  for (const record of active) {
    const workKey = record.workKey ?? `raw:${record.workRaw}`;
    const key = keyOf(record.floor, workKey);
    const existing = groups.get(key);
    if (existing) {
      existing.fact = addDecimal(existing.fact, record.quantity);
      if (!existing.unit) existing.unit = record.unit;
    } else {
      groups.set(key, {
        floor: record.floor,
        workKey,
        workRaw: record.workRaw,
        unit: record.unit,
        plan: "0",
        fact: record.quantity,
        deviation: addDecimal("0", `-${normalizeDecimal(record.quantity) ?? record.quantity}`),
        percent: null
      });
    }
  }
  const rows = [...groups.values()].map((row) => {
    const deviation = addDecimal(row.plan, `-${normalizeDecimal(row.fact) ?? row.fact}`);
    return { ...row, deviation, percent: percentOf(row.fact, row.plan) };
  });
  const order = options.floorOrder ?? [];
  rows.sort((left, right) => {
    const leftIndex = order.indexOf(left.floor);
    const rightIndex = order.indexOf(right.floor);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 9999 : leftIndex) - (rightIndex === -1 ? 9999 : rightIndex);
    }
    return left.floor.localeCompare(right.floor, "ru") || left.workRaw.localeCompare(right.workRaw, "ru");
  });
  const totalPlan = rows.reduce((acc, row) => addDecimal(acc, row.plan), "0");
  const totalFact = rows.reduce((acc, row) => addDecimal(acc, row.fact), "0");
  const totalDeviation = addDecimal(totalPlan, `-${normalizeDecimal(totalFact) ?? totalFact}`);
  const totalPercent = percentOf(totalFact, totalPlan);
  return {
    rows,
    totalPlan,
    totalFact,
    totalDeviation,
    totalPercent,
    factsInQueue: factRows.filter((record) => record.status === "pending").length,
    corrected: factRows.filter((record) => record.supersededBy !== null).length
  };
}
const PLAN_FACT_NORMS_STORE = "PLAN_FACT_NORMS";
function services$3() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$5() {
  var _a, _b;
  const stores = (_b = (_a = services$3().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a);
  const name = stores == null ? void 0 : stores.PLAN_FACT_NORMS;
  if (!name) throw new Error("Сторадж PLAN_FACT_NORMS не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function nowIso$2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function defaultNormRecord(workKey) {
  const seed = WORK_NORMS[workKey];
  if (!seed) return null;
  return {
    id: workKey,
    workKey,
    name: seed.name,
    unit: seed.unit,
    norm: seed.norm,
    crew: seed.crew,
    lag: seed.lag,
    rank: seed.rank,
    source: "customer_form",
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: ""
  };
}
async function listNorms() {
  var _a, _b;
  const stored = await ((_b = (_a = services$3().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$5())) ?? [];
  const byKey = /* @__PURE__ */ new Map();
  for (const key of Object.keys(WORK_NORMS)) {
    const draft = defaultNormRecord(key);
    if (draft) byKey.set(key, draft);
  }
  for (const record of stored) {
    if (record && record.workKey && byKey.has(record.workKey)) byKey.set(record.workKey, record);
  }
  return [...byKey.values()].sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, "ru"));
}
function canManageNorms() {
  const permissions = services$3().permissions;
  return !!(permissions && typeof permissions.canManageNorms === "function" && permissions.canManageNorms());
}
async function saveNorm(patch) {
  const draft = defaultNormRecord(patch.workKey);
  if (!draft) return { ok: false, error: `Неизвестный вид работ: ${patch.workKey}` };
  if (!canManageNorms()) return { ok: false, error: "Нормы задаёт ПТО: у вашей роли нет этого права" };
  const norm = normalizeDecimal(String(patch.norm ?? "").replace(",", "."));
  if (!isDecimal(norm)) return { ok: false, error: "Норма выработки должна быть числом" };
  if (Number(norm) <= 0) return { ok: false, error: "Норма выработки должна быть больше нуля" };
  const crew = Number(String(patch.crew ?? "").replace(",", "."));
  if (!Number.isFinite(crew) || crew <= 0) return { ok: false, error: "Состав бригады должен быть целым числом больше нуля" };
  const lag = normalizeDecimal(String(patch.lag ?? "0").replace(",", "."));
  if (!isDecimal(lag)) return { ok: false, error: "Пауза должна быть числом суток" };
  if (Number(lag) < 0) return { ok: false, error: "Пауза не может быть отрицательной" };
  const permissions = services$3().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "ПТО") : "ПТО";
  const record = {
    ...draft,
    norm,
    crew: Math.round(crew),
    lag,
    source: "pto",
    confirmedBy: actor,
    confirmedAt: nowIso$2(),
    updatedAt: nowIso$2(),
    syncStatus: "pending"
  };
  const storage2 = services$3().storage;
  if (!storage2 || typeof storage2.put !== "function") return { ok: false, error: "Сервис storage недоступен" };
  await storage2.put(storeName$5(), record);
  return { ok: true, record };
}
async function resetNorm(workKey) {
  if (!canManageNorms()) return { ok: false, error: "Нормы задаёт ПТО: у вашей роли нет этого права" };
  const storage2 = services$3().storage;
  if (!storage2 || typeof storage2.delete !== "function") return { ok: false, error: "Сервис storage недоступен" };
  await storage2.delete(storeName$5(), workKey);
  return { ok: true };
}
async function normsForSchedule() {
  var _a;
  const records = await listNorms();
  const result = {};
  for (const record of records) {
    result[record.workKey] = {
      key: record.workKey,
      name: record.name,
      unit: ((_a = WORK_NORMS[record.workKey]) == null ? void 0 : _a.unit) ?? "complex",
      norm: record.norm,
      crew: record.crew,
      lag: record.lag,
      rank: record.rank,
      confirmed: record.source === "pto"
    };
  }
  return result;
}
const PLAN_FACT_IMPORTS_STORE = "PLAN_FACT_IMPORTS";
const PLAN_FACT_WOR_STORE = "PLAN_FACT_WOR";
function storage() {
  var _a, _b;
  const service = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage;
  if (!service) throw new Error("Сервис storage недоступен — сохранение ВОР невозможно");
  return service;
}
function storeName$4(key) {
  var _a, _b;
  const stores = (_b = (_a = storage()).stores) == null ? void 0 : _b.call(_a);
  const name = stores == null ? void 0 : stores[key];
  if (!name) {
    throw new Error(`Сторадж ${key} не объявлен в схеме IndexedDB — обновите страницу, чтобы применилась миграция`);
  }
  return name;
}
function nowIso$1() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function newId(prefix) {
  const generator = storage().generateId;
  if (typeof generator === "function") return generator(prefix);
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
async function saveImport(params) {
  var _a, _b;
  const service = storage();
  const importId = newId("pfimp");
  const createdAt = nowIso$1();
  const record = {
    id: importId,
    objectId: params.objectId,
    filename: params.filename,
    sheet: params.stats.sheet,
    profileId: params.profileId,
    profileTitle: params.profileTitle,
    stats: params.stats,
    createdAt,
    syncStatus: "pending",
    updatedAt: createdAt
  };
  await ((_a = service.put) == null ? void 0 : _a.call(service, storeName$4(PLAN_FACT_IMPORTS_STORE), record));
  const items = params.rows.map((row) => ({
    id: newId("pfwor"),
    objectId: params.objectId,
    importId,
    section: row.section,
    floor: row.floor,
    place: row.place,
    workRaw: row.workRaw,
    workId: row.workId,
    workMatch: row.workMatch,
    matchReason: row.matchReason,
    unitRaw: row.unitRaw,
    unit: row.unit,
    quantity: row.quantity,
    sheet: row.fragment.sheet,
    rowNumber: row.fragment.row,
    column: row.fragment.column,
    createdAt,
    syncStatus: "pending",
    updatedAt: createdAt
  }));
  if (items.length > 0) {
    if (typeof service.putBatch === "function") await service.putBatch(storeName$4(PLAN_FACT_WOR_STORE), items);
    else for (const item of items) await ((_b = service.put) == null ? void 0 : _b.call(service, storeName$4(PLAN_FACT_WOR_STORE), item));
  }
  return { importId, saved: items.length };
}
async function listImports(objectId) {
  var _a, _b;
  const all2 = await ((_b = (_a = storage()).getAll) == null ? void 0 : _b.call(_a, storeName$4(PLAN_FACT_IMPORTS_STORE))) ?? [];
  return all2.filter((record) => record.objectId === objectId).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}
async function listWorRows(objectId, importId) {
  var _a, _b;
  const all2 = await ((_b = (_a = storage()).getAll) == null ? void 0 : _b.call(_a, storeName$4(PLAN_FACT_WOR_STORE))) ?? [];
  return all2.filter(
    (record) => record.objectId === objectId && (!importId || record.importId === importId)
  );
}
async function deleteImport(importId) {
  var _a, _b, _c;
  const service = storage();
  const rows = await ((_a = service.getAll) == null ? void 0 : _a.call(service, storeName$4(PLAN_FACT_WOR_STORE))) ?? [];
  const own = rows.filter((record) => record.importId === importId);
  for (const record of own) await ((_b = service.delete) == null ? void 0 : _b.call(service, storeName$4(PLAN_FACT_WOR_STORE), record.id));
  await ((_c = service.delete) == null ? void 0 : _c.call(service, storeName$4(PLAN_FACT_IMPORTS_STORE), importId));
  return { removedImport: true, removedRows: own.length };
}
const store = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  PLAN_FACT_IMPORTS_STORE,
  PLAN_FACT_WOR_STORE,
  deleteImport,
  listImports,
  listWorRows,
  saveImport
}, Symbol.toStringTag, { value: "Module" }));
const PULL_STAMP_KEY = "rbi_plan_fact_last_pull_at";
const PULL_OVERLAP_MS = 5e3;
const BATCH = 400;
const PULL_PAGE = 1e3;
const PULL_MAX_PAGES = 50;
function platform() {
  var _a, _b;
  const scope = window;
  return {
    storage: (_b = (_a = scope.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage,
    config: scope.syncConfig,
    client: scope.supabaseClient
  };
}
function storeName$3(key) {
  var _a, _b;
  const name = (_b = (_a = platform().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу, чтобы применилась миграция`);
  return name;
}
function companyId() {
  var _a, _b;
  const company = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.company;
  const id = company && typeof company.getCompanyId === "function" ? company.getCompanyId() : "";
  return String(id || "rbi");
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function asDecimal(value) {
  const text2 = typeof value === "number" ? String(value) : String(value ?? "");
  return normalizeDecimal(text2.replace(",", ".")) ?? text2;
}
const ENTITIES = [
  {
    key: "imports",
    table: "plan_fact_imports",
    storeKey: PLAN_FACT_IMPORTS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId,
      filename: r.filename,
      sheet: r.sheet,
      profile_id: r.profileId,
      profile_title: r.profileTitle,
      stats: r.stats ?? {},
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id),
      filename: String(row.filename ?? ""),
      sheet: String(row.sheet ?? ""),
      profileId: String(row.profile_id ?? ""),
      profileTitle: String(row.profile_title ?? ""),
      stats: row.stats ?? {},
      createdAt: String(row.created_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "wor",
    table: "plan_fact_wor",
    storeKey: PLAN_FACT_WOR_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId,
      import_id: r.importId,
      section: r.section,
      floor: r.floor,
      place: r.place,
      work_raw: r.workRaw,
      work_id: r.workId ?? null,
      work_match: r.workMatch ?? "",
      match_reason: r.matchReason ?? "",
      unit_raw: r.unitRaw ?? "",
      unit: r.unit ?? null,
      quantity: asDecimal(r.quantity),
      sheet: r.sheet ?? "",
      row_number: r.rowNumber ?? null,
      column_number: r.column ?? null,
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id),
      importId: String(row.import_id ?? ""),
      section: String(row.section ?? ""),
      floor: String(row.floor ?? ""),
      place: String(row.place ?? ""),
      workRaw: String(row.work_raw ?? ""),
      workId: row.work_id ?? null,
      workMatch: String(row.work_match ?? ""),
      matchReason: String(row.match_reason ?? ""),
      unitRaw: String(row.unit_raw ?? ""),
      unit: row.unit ?? null,
      quantity: asDecimal(row.quantity),
      sheet: String(row.sheet ?? ""),
      rowNumber: Number(row.row_number ?? 0),
      column: row.column_number ?? null,
      createdAt: String(row.created_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "facts",
    table: "plan_fact_facts",
    storeKey: PLAN_FACT_FACTS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId,
      section: r.section,
      floor: r.floor,
      place: r.place,
      work_key: r.workKey ?? null,
      work_raw: r.workRaw,
      unit: r.unit,
      quantity: asDecimal(r.quantity),
      fact_date: r.factDate,
      comment: r.comment ?? "",
      author: r.author ?? "",
      status: r.status ?? "pending",
      corrects_id: r.correctsId ?? null,
      superseded_by: r.supersededBy ?? null,
      revision: Number(r.revision ?? 1),
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id),
      section: String(row.section ?? ""),
      floor: String(row.floor ?? ""),
      place: String(row.place ?? ""),
      workKey: row.work_key ?? null,
      workRaw: String(row.work_raw ?? ""),
      unit: String(row.unit ?? ""),
      quantity: asDecimal(row.quantity),
      factDate: String(row.fact_date ?? ""),
      comment: String(row.comment ?? ""),
      author: String(row.author ?? ""),
      status: row.status === "handed_over" ? "handed_over" : "pending",
      correctsId: row.corrects_id ?? null,
      supersededBy: row.superseded_by ?? null,
      revision: Number(row.revision ?? 1),
      createdAt: String(row.created_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    }),
    // Факт, уехавший в облако, становится переданным: очередь и статус не должны расходиться.
    markAfterPush: (record) => ({ ...record, status: "handed_over" })
  },
  {
    key: "norms",
    table: "plan_fact_norms",
    storeKey: PLAN_FACT_NORMS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      work_key: r.workKey,
      name: r.name,
      unit: r.unit,
      norm: asDecimal(r.norm),
      crew: Number(r.crew ?? 1),
      lag: asDecimal(r.lag ?? "0"),
      rank: Number(r.rank ?? 0),
      source: r.source ?? "pto",
      confirmed_by: r.confirmedBy ?? null,
      confirmed_at: r.confirmedAt ?? null
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      workKey: String(row.work_key ?? ""),
      name: String(row.name ?? ""),
      unit: String(row.unit ?? ""),
      norm: asDecimal(row.norm),
      crew: Number(row.crew ?? 1),
      lag: asDecimal(row.lag ?? "0"),
      rank: Number(row.rank ?? 0),
      source: row.source === "pto" ? "pto" : "customer_form",
      confirmedBy: row.confirmed_by ?? null,
      confirmedAt: row.confirmed_at ?? null,
      updatedAt: String(row.updated_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    }),
    // В реестре лежат только нормы ПТО: черновики заказчика приходят из кода, их не отправляем.
    shouldPush: (record) => record.syncStatus !== "synced" && record.source === "pto"
  },
  {
    key: "contours",
    table: "plan_fact_wor_quantities",
    storeKey: PLAN_FACT_QUANTITIES_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId ?? "",
      wor_item_id: r.worItemId,
      quantity_kind: r.kind,
      quantity: asDecimal(r.quantity),
      source: r.source ?? "",
      method: r.method ?? "",
      note: r.note ?? "",
      updated_by: r.updatedBy ?? "",
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id ?? ""),
      worItemId: String(row.wor_item_id ?? ""),
      kind: String(row.quantity_kind ?? ""),
      quantity: asDecimal(row.quantity),
      source: String(row.source ?? ""),
      method: String(row.method ?? ""),
      note: String(row.note ?? ""),
      updatedBy: String(row.updated_by ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "works",
    table: "plan_fact_works",
    storeKey: PLAN_FACT_WORKS_STORE,
    scope: "company",
    columns: "*",
    toCloud: (r) => ({
      id: r.id,
      company_id: companyId(),
      code: r.code ?? "",
      name: r.name,
      unit: r.unit,
      stage: r.stage ?? "",
      group_name: r.groupName ?? "",
      calc_rule: r.calcRule ?? "",
      revision: Number(r.revision ?? 1),
      is_active: r.isActive !== false,
      source: r.source ?? "pto",
      created_by: r.createdBy ?? "",
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      unit: String(row.unit ?? ""),
      stage: String(row.stage ?? ""),
      groupName: String(row.group_name ?? ""),
      calcRule: String(row.calc_rule ?? ""),
      revision: Number(row.revision ?? 1),
      isActive: row.is_active !== false,
      source: row.source === "builtin" ? "builtin" : "pto",
      createdBy: String(row.created_by ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "aliases",
    table: "plan_fact_work_aliases",
    storeKey: PLAN_FACT_WORK_ALIASES_STORE,
    scope: "company",
    columns: "*",
    toCloud: (r) => ({
      id: r.id,
      company_id: companyId(),
      work_id: r.workId,
      alias: r.alias,
      normalized_alias: r.normalizedAlias,
      source: r.source ?? "pto",
      created_by: r.createdBy ?? "",
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      workId: String(row.work_id ?? ""),
      alias: String(row.alias ?? ""),
      normalizedAlias: String(row.normalized_alias ?? ""),
      source: row.source === "form" ? "form" : "pto",
      createdBy: String(row.created_by ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "proposals",
    table: "plan_fact_proposals",
    storeKey: PLAN_FACT_PROPOSALS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId,
      title: r.title ?? "",
      status: r.status ?? "draft",
      submitted_by: r.submittedBy ?? "",
      submitted_at: r.submittedAt ?? null,
      decided_by: r.decidedBy ?? "",
      decided_at: r.decidedAt ?? null,
      decision_reason: r.decisionReason ?? "",
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id ?? ""),
      title: String(row.title ?? ""),
      status: String(row.status ?? "draft"),
      submittedBy: String(row.submitted_by ?? ""),
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      decidedBy: String(row.decided_by ?? ""),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      decisionReason: String(row.decision_reason ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "proposalRows",
    table: "plan_fact_proposal_rows",
    storeKey: PLAN_FACT_PROPOSAL_ROWS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      proposal_id: r.proposalId,
      wor_item_id: r.worItemId,
      quantity: asDecimal(r.quantity),
      note: r.note ?? "",
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      proposalId: String(row.proposal_id ?? ""),
      worItemId: String(row.wor_item_id ?? ""),
      quantity: String(row.quantity ?? ""),
      note: String(row.note ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "baselines",
    table: "plan_fact_baselines",
    storeKey: PLAN_FACT_BASELINES_STORE,
    columns: "*",
    cursorColumn: "created_at",
    // Baseline неизменяем: ни updated_at, ни is_deleted у него нет — и не должно быть.
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      object_id: r.objectId,
      proposal_id: r.proposalId ?? null,
      approved_by: r.approvedBy ?? "",
      approved_at: r.approvedAt ?? null,
      snapshot: r.snapshot ?? { rows: [] }
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: String(row.object_id ?? ""),
      proposalId: row.proposal_id ? String(row.proposal_id) : null,
      approvedBy: String(row.approved_by ?? ""),
      approvedAt: String(row.approved_at ?? row.created_at ?? ""),
      snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : { rows: [] },
      createdAt: String(row.created_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "changeRequests",
    table: "plan_fact_change_requests",
    storeKey: PLAN_FACT_CHANGE_REQUESTS_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id,
      project_code: p,
      baseline_id: r.baselineId ?? null,
      wor_item_id: r.worItemId,
      quantity_kind: r.quantityKind,
      qty_before: r.qtyBefore === null ? null : asDecimal(r.qtyBefore),
      qty_after: asDecimal(r.qtyAfter),
      reason: r.reason ?? "",
      status: r.status ?? "created",
      created_by: r.createdBy ?? "",
      checked_by: r.checkedBy ?? "",
      decided_by: r.decidedBy ?? "",
      decided_at: r.decidedAt ?? null,
      effective_at: r.effectiveAt ?? null,
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id),
      objectId: "",
      baselineId: row.baseline_id ? String(row.baseline_id) : null,
      worItemId: String(row.wor_item_id ?? ""),
      quantityKind: String(row.quantity_kind ?? "APPROVED"),
      qtyBefore: row.qty_before === null || row.qty_before === void 0 ? null : String(row.qty_before),
      qtyAfter: String(row.qty_after ?? ""),
      reason: String(row.reason ?? ""),
      status: String(row.status ?? "created"),
      createdBy: String(row.created_by ?? ""),
      createdAt: String(row.created_at ?? ""),
      checkedBy: String(row.checked_by ?? ""),
      decidedBy: String(row.decided_by ?? ""),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      effectiveAt: row.effective_at ? String(row.effective_at) : null,
      updatedAt: String(row.updated_at ?? ""),
      workRaw: "",
      place: "",
      isDeleted: !!row.is_deleted,
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "audit",
    table: "plan_fact_audit",
    storeKey: PLAN_FACT_AUDIT_STORE,
    columns: "*",
    insertOnly: true,
    cursorColumn: "created_at",
    // id журнала выдаёт база: отправляем всё, кроме id, и никогда не переписываем записи.
    toCloud: (r, p) => ({
      project_code: p,
      entity: r.entity,
      entity_id: r.entityId,
      action: r.action,
      actor: r.actor ?? "",
      reason: r.reason ?? "",
      before_value: r.beforeValue ?? null,
      after_value: r.afterValue ?? null
    }),
    fromCloud: (row) => ({
      id: String(row.id ?? ""),
      entity: String(row.entity ?? ""),
      entityId: String(row.entity_id ?? ""),
      action: String(row.action ?? ""),
      actor: String(row.actor ?? ""),
      reason: String(row.reason ?? ""),
      beforeValue: row.before_value ?? null,
      afterValue: row.after_value ?? null,
      createdAt: String(row.created_at ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    })
  },
  {
    key: "calendar",
    table: "plan_fact_calendar",
    storeKey: PLAN_FACT_CALENDAR_STORE,
    columns: "*",
    toCloud: (r, p) => ({
      id: r.id ?? CALENDAR_RECORD_ID,
      project_code: p,
      work_week: Number(r.workWeek ?? 5),
      non_working_days: Array.isArray(r.nonWorkingDays) ? r.nonWorkingDays : [],
      updated_by: r.updatedBy ?? ""
    }),
    fromCloud: (row) => ({
      id: String(row.id ?? CALENDAR_RECORD_ID),
      workWeek: [5, 6, 7].includes(Number(row.work_week)) ? Number(row.work_week) : 5,
      nonWorkingDays: normalizeNonWorkingDays(row.non_working_days),
      updatedAt: String(row.updated_at ?? ""),
      updatedBy: String(row.updated_by ?? ""),
      syncStatus: "synced",
      origin: "cloud"
    })
  }
];
function isMissingTable(message) {
  return /PGRST205|Could not find the table|does not exist/i.test(String(message || ""));
}
function emptyResult(skipped, error = null) {
  return {
    ok: skipped === null,
    skipped,
    pushed: 0,
    pulled: 0,
    failed: 0,
    error,
    at: nowIso(),
    pendingTables: [],
    localMissing: []
  };
}
async function readiness() {
  var _a, _b, _c;
  const { config, client } = platform();
  if (!config || !config.enabled || !config.projectCode) return { ok: false, reason: "disabled" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
  if (!client) return { ok: false, reason: "no-session" };
  try {
    const session = await ((_b = (_a = client.auth) == null ? void 0 : _a.getSession) == null ? void 0 : _b.call(_a));
    if (!((_c = session == null ? void 0 : session.data) == null ? void 0 : _c.session)) return { ok: false, reason: "no-session" };
  } catch (_error) {
    return { ok: false, reason: "no-session" };
  }
  return { ok: true, client, projectCode: String(config.projectCode) };
}
async function pushEntity(spec, client, projectCode) {
  const storage2 = platform().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { pushed: 0, failed: 0, missing: false, localMissing: false };
  let store2;
  try {
    store2 = storeName$3(spec.storeKey);
  } catch (_error) {
    return { pushed: 0, failed: 0, missing: false, localMissing: true };
  }
  const all2 = await storage2.getAll(store2);
  const pending = all2.filter((record) => spec.shouldPush ? spec.shouldPush(record) : record.syncStatus !== "synced");
  if (pending.length === 0) return { pushed: 0, failed: 0, missing: false, localMissing: false };
  let pushed = 0;
  let failed = 0;
  for (let offset = 0; offset < pending.length; offset += BATCH) {
    const slice = pending.slice(offset, offset + BATCH);
    const rows = slice.map((record) => spec.toCloud(record, projectCode));
    const { error } = spec.insertOnly ? await client.from(spec.table).insert(rows) : await client.from(spec.table).upsert(rows, { onConflict: "id" });
    if (error) {
      if (isMissingTable(error.message)) return { pushed, failed, missing: true, localMissing: false };
      failed += slice.length;
      continue;
    }
    for (const record of slice) {
      const stamped = spec.markAfterPush ? spec.markAfterPush(record) : record;
      await storage2.put(store2, { ...stamped, syncStatus: "synced", syncedAt: nowIso() });
      pushed += 1;
    }
  }
  return { pushed, failed, missing: false, localMissing: false };
}
async function pullEntity(spec, client, projectCode, since) {
  const storage2 = platform().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { pulled: 0, failed: 0, missing: false, localMissing: false };
  let store2;
  try {
    store2 = storeName$3(spec.storeKey);
  } catch (_error) {
    return { pulled: 0, failed: 0, missing: false, localMissing: true };
  }
  const incoming = [];
  let missing = false;
  for (let page = 0; page < PULL_MAX_PAGES; page += 1) {
    const scopeColumn = spec.scope === "company" ? "company_id" : "project_code";
    const scopeValue = spec.scope === "company" ? companyId() : projectCode;
    const query = client.from(spec.table).select(spec.columns).eq(scopeColumn, scopeValue);
    const cursorColumn = spec.cursorColumn ?? "updated_at";
    const filtered = since ? query.gt(cursorColumn, since) : query;
    const from = page * PULL_PAGE;
    const ordered = filtered.order(cursorColumn, { ascending: true }).order("id", { ascending: true });
    const { data, error } = await ordered.range(from, from + PULL_PAGE - 1);
    if (error) {
      if (isMissingTable(error.message)) missing = true;
      else if (incoming.length === 0) return { pulled: 0, failed: 1, missing: false, localMissing: false };
      break;
    }
    const batch = data ?? [];
    incoming.push(...batch);
    if (batch.length < PULL_PAGE) break;
  }
  if (missing && incoming.length === 0) return { pulled: 0, failed: 0, missing: true, localMissing: false };
  if (incoming.length === 0) return { pulled: 0, failed: 0, missing: false, localMissing: false };
  const local = /* @__PURE__ */ new Map();
  for (const record of await storage2.getAll(store2)) local.set(String(record.id), record);
  let pulled = 0;
  const writes = [];
  for (const row of incoming) {
    const record = spec.fromCloud(row);
    const existing = local.get(String(record.id));
    if (existing && existing.syncStatus !== "synced") continue;
    if (existing) record.syncStatus = "synced";
    writes.push(record);
    pulled += 1;
  }
  if (writes.length > 0) {
    if (typeof storage2.putBatch === "function") await storage2.putBatch(store2, writes);
    else for (const record of writes) await storage2.put(store2, record);
  }
  return { pulled, failed: 0, missing: false, localMissing: false };
}
let _lastResult = null;
let _running = null;
async function syncPlanFact() {
  if (_running) return _running;
  _running = (async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const ready = await readiness();
    if (!ready.ok) {
      const skipped = emptyResult(ready.reason);
      _lastResult = skipped;
      return skipped;
    }
    const sinceKey = PULL_STAMP_KEY;
    const rawSince = Number(localStorage.getItem(sinceKey) || 0);
    const since = rawSince > 0 ? new Date(rawSince - PULL_OVERLAP_MS).toISOString() : null;
    const result = emptyResult(null);
    const startedAt = Date.now();
    try {
      for (const spec of ENTITIES) {
        const pushed = await pushEntity(spec, ready.client, ready.projectCode);
        result.pushed += pushed.pushed;
        result.failed += pushed.failed;
        if (pushed.missing) (_a = result.pendingTables) == null ? void 0 : _a.push(spec.table);
        if (pushed.localMissing) (_b = result.localMissing) == null ? void 0 : _b.push(spec.table);
        const pulled = await pullEntity(spec, ready.client, ready.projectCode, since);
        result.pulled += pulled.pulled;
        result.failed += pulled.failed;
        if (pulled.missing && !((_c = result.pendingTables) == null ? void 0 : _c.includes(spec.table))) (_d = result.pendingTables) == null ? void 0 : _d.push(spec.table);
        if (pulled.localMissing && !((_e = result.localMissing) == null ? void 0 : _e.includes(spec.table))) (_f = result.localMissing) == null ? void 0 : _f.push(spec.table);
      }
      result.ok = result.failed === 0;
      localStorage.setItem(sinceKey, String(startedAt));
    } catch (error) {
      result.ok = false;
      result.error = error instanceof Error ? error.message : String(error);
    }
    result.at = nowIso();
    _lastResult = result;
    (_i = (_h = (_g = window.RBI) == null ? void 0 : _g.events) == null ? void 0 : _h.emit) == null ? void 0 : _i.call(_h, "plan-fact:synced", result);
    return result;
  })();
  try {
    return await _running;
  } finally {
    _running = null;
  }
}
async function planFactQueue() {
  const { storage: storage2, config } = platform();
  const byEntity = {};
  let pending = 0;
  if (storage2 == null ? void 0 : storage2.getAll) {
    for (const spec of ENTITIES) {
      try {
        const all2 = await storage2.getAll(storeName$3(spec.storeKey));
        const count = all2.filter((record) => spec.shouldPush ? spec.shouldPush(record) : record.syncStatus !== "synced").length;
        byEntity[spec.key] = count;
        pending += count;
      } catch (_error) {
        byEntity[spec.key] = 0;
      }
    }
  }
  return {
    pending,
    byEntity,
    lastResult: _lastResult,
    projectCode: (config == null ? void 0 : config.projectCode) ?? null,
    enabled: !!((config == null ? void 0 : config.enabled) && (config == null ? void 0 : config.projectCode))
  };
}
let _wired = false;
function initPlanFactCloud() {
  var _a, _b, _c, _d, _e, _f;
  if (_wired) return;
  _wired = true;
  const run = () => {
    void syncPlanFact().catch(() => {
    });
  };
  if (typeof window.addEventListener === "function") window.addEventListener("online", run);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("sync:completed", () => setTimeout(run, 1500));
  }
  (_c = (_b = (_a = window.RBI) == null ? void 0 : _a.events) == null ? void 0 : _b.on) == null ? void 0 : _c.call(_b, "sync:completed", () => setTimeout(run, 1500));
  (_f = (_e = (_d = window.RBI) == null ? void 0 : _d.events) == null ? void 0 : _e.on) == null ? void 0 : _f.call(_e, "platform:ready", () => setTimeout(run, 3e3));
  window.PlanFactCloud = {
    sync: syncPlanFact,
    queue: planFactQueue,
    entities: ENTITIES.map((spec) => ({ key: spec.key, table: spec.table, scope: spec.scope ?? "project" })),
    // Справочник и сопоставление — для смоука и отладки: проверить, что данные из облака
    // действительно участвуют в сопоставлении, а не лежат мёртвым грузом.
    catalog: buildCatalog,
    match: matchInCatalog,
    works: { list: listWorks, save: saveWork, archive: archiveWork },
    aliases: { list: listAliases, save: saveAlias },
    // Утверждение объёмов — для смоука и автоматизации: тот же путь, что и в интерфейсе.
    approval: {
      propose: proposeContours,
      decide: decideProposal,
      requestChange,
      decideChange: decideChangeRequest,
      listProposals,
      listBaselines,
      listChanges: listChangeRequests,
      audit: listAudit
    }
  };
}
function planFactServices() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function objectDisplayName(object) {
  if (!object) return "";
  return String(object.display_name || object.displayName || object.canonical_key || "");
}
function currentScope() {
  const permissions = planFactServices().permissions;
  if (!permissions || typeof permissions.getDataScope !== "function") return "all";
  const role = typeof permissions.getCurrentRole === "function" ? permissions.getCurrentRole() : void 0;
  return String(permissions.getDataScope(role) || "all");
}
function listVisibleObjects() {
  const services2 = planFactServices();
  const objects = services2.objects;
  if (!objects || typeof objects.list !== "function") return [];
  const all2 = (objects.list() || []).filter((item) => !!item && typeof item.id === "string");
  const scope = currentScope();
  if (scope === "none") return [];
  if (scope === "all") return all2;
  const permissions = services2.permissions;
  const assigned = permissions && typeof permissions.getAssignedProjects === "function" ? permissions.getAssignedProjects() || [] : [];
  if (!assigned.length) return [];
  return all2.filter((item) => {
    if (permissions && typeof permissions.isRecordInAssignedProjects === "function") {
      return !!permissions.isRecordInAssignedProjects(item, assigned);
    }
    return assigned.indexOf(item.id) !== -1;
  });
}
function scopeLabel() {
  switch (currentScope()) {
    case "none":
      return "доступ к объектам не выдан";
    case "all":
      return "все объекты компании";
    case "ownProject":
      return "только назначенные вам объекты";
    case "ownContractor":
      return "только объекты вашего подрядчика";
    case "ownProjectOrOwnRecords":
      return "назначенные вам объекты";
    default:
      return "доступные вам объекты";
  }
}
async function rebuildObjects() {
  const objects = planFactServices().objects;
  if (objects && typeof objects.rebuildFromLocations === "function") {
    await objects.rebuildFromLocations();
  }
}
const UNRESOLVED_MARK = {
  auto: "сопоставлено автоматически",
  manual: "сопоставлено вручную",
  unresolved: "не сопоставлено"
};
function exportCell(value) {
  const text2 = String(value ?? "");
  if (!/^-?\d+(\.\d+)?$/.test(text2)) return text2;
  const asNumber = Number(text2);
  if (!Number.isFinite(asNumber)) return text2;
  return String(asNumber) === text2 ? asNumber : text2;
}
function sanitizeFileName(name) {
  return String(name || "объект").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}
function worSheet(input, summary) {
  const header = [
    "Объект",
    "Секция",
    "Этаж",
    "Помещение",
    "Работа (как в форме)",
    "Работа (справочник)",
    "Код работы",
    "ЕИ",
    "План (форма заказчика)",
    "Факт",
    "Отклонение",
    "Выполнено, %",
    "Сопоставление",
    "Лист",
    "Строка",
    "Колонка"
  ];
  const factsByKey = /* @__PURE__ */ new Map();
  for (const row of summary.rows) {
    factsByKey.set(`${row.floor}|${row.workKey}`, {
      fact: row.fact,
      deviation: row.deviation,
      percent: row.percent,
      workRaw: row.workRaw
    });
  }
  const rows = [header];
  for (const record of input.worRows) {
    const key = `${record.floor}|${record.workId ?? `raw:${record.workRaw}`}`;
    const aggregate = factsByKey.get(key);
    rows.push([
      input.objectName,
      record.section,
      record.floor,
      record.place,
      record.workRaw,
      aggregate ? aggregate.workRaw : record.workRaw,
      record.workId ?? "",
      record.unit || record.unitRaw || "",
      exportCell(record.quantity),
      aggregate ? exportCell(aggregate.fact) : "",
      aggregate ? exportCell(aggregate.deviation) : "",
      aggregate && aggregate.percent !== null ? aggregate.percent : "",
      UNRESOLVED_MARK[record.workMatch] ?? record.workMatch ?? "",
      record.sheet ?? "",
      Number(record.rowNumber ?? 0),
      record.column ?? ""
    ]);
  }
  return { name: "ВОР", rows };
}
function summarySheet(summary) {
  const rows = [
    ["Этаж", "Работа", "ЕИ", "План", "Факт", "Отклонение", "Выполнено, %"]
  ];
  for (const row of summary.rows) {
    rows.push([
      row.floor,
      row.workRaw,
      row.unit,
      exportCell(row.plan),
      exportCell(row.fact),
      exportCell(row.deviation),
      row.percent === null ? "" : row.percent
    ]);
  }
  rows.push([
    "ИТОГО",
    "",
    "",
    exportCell(summary.totalPlan),
    exportCell(summary.totalFact),
    exportCell(summary.totalDeviation),
    summary.totalPercent === null ? "" : summary.totalPercent
  ]);
  return { name: "Свод по этажам", rows };
}
function issuesSheet(input) {
  const rows = [
    ["Тип", "Работа (как в форме)", "ЕИ", "Объём", "Этаж", "Помещение", "Лист", "Строка", "Что сделать"]
  ];
  let count = 0;
  for (const record of input.worRows) {
    const problems = [];
    if (!record.workId || record.workMatch === "unresolved") {
      problems.push(["Вид работ не сопоставлен", "Подтвердить связку с справочником работ (синоним или новый вид)"]);
    }
    if (!record.unit) {
      problems.push(["Единица не распознана", `Указать единицу для «${record.unitRaw || "—"}»`]);
    }
    if (String(record.quantity).startsWith("-")) {
      problems.push(["Отрицательный объём", "Оформить отдельной корректировкой, а не минусом в ВОР"]);
    }
    for (const [type, action] of problems) {
      count += 1;
      rows.push([
        type,
        record.workRaw,
        record.unit || record.unitRaw || "",
        exportCell(record.quantity),
        record.floor,
        record.place,
        record.sheet ?? "",
        Number(record.rowNumber ?? 0),
        action
      ]);
    }
  }
  return { sheet: { name: "Замечания", rows }, count };
}
function aboutSheet(input, stats) {
  const generatedAt = input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const rows = [
    ["Выгрузка ВОР", ""],
    ["Объект", input.objectName],
    ["Сформирована", generatedAt],
    ["Позиций ВОР", stats.worRows],
    ["Записей факта", stats.factRows],
    ["Замечаний", stats.issues],
    ["Этажей", stats.floors],
    ["Видов работ", stats.works],
    ["", ""],
    ["Контуры объёмов (ТЗ VOR-016)", "Состояние в этой выгрузке"],
    ["План (форма заказчика)", "есть"],
    ["Факт", "есть"],
    ["RD", "нет — контуры появятся блоком ТЗ-2"],
    ["Договор", "нет — контуры появятся блоком ТЗ-2"],
    ["Предложено ПТО", "нет — контуры появятся блоком ТЗ-2"],
    ["Утверждено РП", "нет — контуры появятся блоком ТЗ-2"],
    ["Принято заказчиком", "нет — вне рамки модуля (ADR-016)"],
    ["", ""],
    ["Правило округления", "Проценты выполнения показаны двумя знаками без округления — выполнение никогда не завышается."],
    ["", "Объёмы и отклонения выгружаются точно, без округления."],
    ["Важно", "Факт в листе «ВОР» показан сводно по паре «этаж + работа» (как в своде план-факт),"],
    ["", "а не разнесён по позициям: разнесение появится вместе с привязкой факта к позиции."]
  ];
  return { name: "О выгрузке", rows };
}
function buildWorExport(input) {
  const summary = buildPlanFactSummary(input.worRows, input.factRows);
  const issues = issuesSheet(input);
  const works = new Set(input.worRows.map((row) => row.workId ?? `raw:${row.workRaw}`));
  const floors = new Set(input.worRows.map((row) => row.floor));
  const stats = {
    worRows: input.worRows.length,
    factRows: input.factRows.length,
    issues: issues.count,
    floors: floors.size,
    works: works.size
  };
  const date = (input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString()).slice(0, 10);
  return {
    filename: `ВОР ${sanitizeFileName(input.objectName)} ${date}.xlsx`,
    sheets: [worSheet(input, summary), summarySheet(summary), issues.sheet, aboutSheet(input, stats)],
    stats
  };
}
function sheetJs$1() {
  const lib = window.XLSX;
  return lib && lib.utils && typeof lib.writeFile === "function" ? lib : null;
}
function writeWorWorkbook(result) {
  const lib = sheetJs$1();
  if (!lib) return { ok: false, error: "Модуль выгрузки Excel не загружен — обновите страницу" };
  try {
    const workbook = lib.utils.book_new();
    for (const sheet of result.sheets) {
      const worksheet = lib.utils.aoa_to_sheet(sheet.rows);
      const widths = (sheet.rows[0] ?? []).map((_cell, index2) => ({
        wch: Math.min(48, Math.max(10, ...sheet.rows.slice(0, 200).map((row) => String(row[index2] ?? "").length + 2)))
      }));
      worksheet["!cols"] = widths;
      lib.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
    }
    lib.writeFile(workbook, result.filename);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function formatExportSummary(result) {
  return `Выгружено: позиций ${result.stats.worRows}, замечаний ${result.stats.issues}, этажей ${result.stats.floors}, видов работ ${result.stats.works}. Файл: ${result.filename}`;
}
const CONTRAST_PAIRS = [
  { left: "RD", right: "CONTRACT", title: "РД ↔ договор" },
  { left: "CONTRACT", right: "PROPOSED", title: "Договор ↔ предложено" },
  { left: "RD", right: "PROPOSED", title: "РД ↔ предложено" }
];
const DEFAULT_THRESHOLD = { workId: null, unit: null, percent: "5", absolute: "0" };
function thresholdFor(workId, unit, rules) {
  const byWork = rules.find((rule) => rule.workId !== null && rule.workId === workId && (rule.unit === null || rule.unit === unit));
  if (byWork) return byWork;
  const byUnit = rules.find((rule) => rule.workId === null && rule.unit !== null && rule.unit === unit);
  if (byUnit) return byUnit;
  return rules.find((rule) => rule.workId === null && rule.unit === null) ?? DEFAULT_THRESHOLD;
}
function contrastOf(left, right, digits = 1) {
  const absolute = addDecimal(right, left.startsWith("-") ? left.slice(1) : `-${left}`);
  if (compareDecimal(left, "0") === 0) {
    return { absolute, percent: "0" };
  }
  const raw = divideDecimal(scaleByPowerOfTen(absolute, 2), left, 6);
  return { absolute, percent: truncate(raw, digits) };
}
function truncate(value, digits) {
  const text2 = String(value);
  const negative = text2.startsWith("-");
  const body = negative ? text2.slice(1) : text2;
  const [integer, fraction = ""] = body.split(".");
  if (digits <= 0) return `${negative ? "-" : ""}${integer === "" ? "0" : integer}`;
  const cut = fraction.slice(0, digits).padEnd(digits, "0");
  return `${negative ? "-" : ""}${integer === "" ? "0" : integer}.${cut}`;
}
function exceeds(value, threshold) {
  if (compareDecimal(threshold, "0") <= 0) return false;
  const magnitude = value.startsWith("-") ? value.slice(1) : value;
  return compareDecimal(magnitude, threshold) > 0;
}
function reconcileRows(rows, rules = []) {
  const result = [];
  for (const row of rows) {
    for (const pair of CONTRAST_PAIRS) {
      const left = row.values[pair.left];
      const right = row.values[pair.right];
      const threshold = thresholdFor(row.workId, row.unit, rules);
      const title = pair.title;
      if (left === null || right === null) {
        result.push({
          worItemId: row.worItemId,
          pair: title,
          place: row.place,
          workRaw: row.workRaw,
          workId: row.workId,
          unit: row.unit,
          left,
          right,
          absolute: null,
          percent: null,
          threshold,
          status: "incomplete",
          reason: left === null && right === null ? "оба контура пусты — сравнивать нечего" : `не заполнено: ${left === null ? pair.left : pair.right}`
        });
        continue;
      }
      const { absolute, percent } = contrastOf(left, right);
      const overAbsolute = exceeds(absolute, threshold.absolute);
      const overPercent = exceeds(percent, threshold.percent);
      result.push({
        worItemId: row.worItemId,
        pair: title,
        place: row.place,
        workRaw: row.workRaw,
        workId: row.workId,
        unit: row.unit,
        left,
        right,
        absolute,
        percent,
        threshold,
        status: overAbsolute || overPercent ? "warning" : "ok",
        reason: overAbsolute || overPercent ? `расхождение ${absolute} (${percent}%) выше порога ${threshold.absolute} / ${threshold.percent}%` : `в пределах порога ${threshold.absolute} / ${threshold.percent}%`
      });
    }
  }
  return result;
}
function aggregateReconciliation(rows, rules = []) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  const result = [];
  for (const [key, bucket] of groups) {
    for (const pair of CONTRAST_PAIRS) {
      const leftValues = bucket.map((row) => row.values[pair.left]).filter((value) => value !== null);
      const rightValues = bucket.map((row) => row.values[pair.right]).filter((value) => value !== null);
      if (leftValues.length === 0 || rightValues.length === 0) continue;
      const leftSum = sumDecimal(leftValues);
      const rightSum = sumDecimal(rightValues);
      const { absolute, percent } = contrastOf(leftSum, rightSum);
      const threshold = thresholdFor(bucket[0].workId, bucket[0].unit, rules);
      const over = exceeds(absolute, threshold.absolute) || exceeds(percent, threshold.percent);
      result.push({
        workKey: key,
        workRaw: bucket[0].workRaw,
        unit: bucket[0].unit,
        pair: pair.title,
        leftSum,
        rightSum,
        absolute,
        percent,
        threshold,
        status: over ? "warning" : "ok"
      });
    }
  }
  return result.sort((left, right) => Math.abs(Number(right.percent)) - Math.abs(Number(left.percent)));
}
function reconciliationSummary(rows) {
  return {
    total: rows.length,
    warnings: rows.filter((row) => row.status === "warning").length,
    incomplete: rows.filter((row) => row.status === "incomplete").length,
    ok: rows.filter((row) => row.status === "ok").length
  };
}
const PLAN_FACT_THRESHOLDS_STORE = "PLAN_FACT_THRESHOLDS";
function services$2() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName$2() {
  var _a, _b;
  const name = (_b = (_a = services$2().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)[PLAN_FACT_THRESHOLDS_STORE];
  if (!name) throw new Error("Сторадж порогов не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function defaultRules() {
  return [{ ...DEFAULT_THRESHOLD }];
}
function parseThresholdInput(raw, field2) {
  const text2 = String(raw ?? "").trim().replace(",", ".").replace(/%$/, "").trim();
  if (text2 === "") return { ok: true, value: "0" };
  if (!/^-?\d+(\.\d+)?$/.test(text2)) {
    return { ok: false, error: `Порог «${field2 === "percent" ? "процент" : "единицы"}» — это число, например 5 или 2,5` };
  }
  const value = Number(text2);
  if (value < 0) return { ok: false, error: "Порог не может быть отрицательным" };
  if (field2 === "percent" && value > 100) return { ok: false, error: "Процентный порог больше 100 не имеет смысла" };
  return { ok: true, value: text2 };
}
async function loadThresholds(objectId) {
  var _a, _b;
  if (!objectId) return defaultRules();
  const stored = await ((_b = (_a = services$2().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName$2())) ?? [];
  const record = stored.find((item) => item && item.objectId === objectId && Array.isArray(item.rules));
  if (!record || record.rules.length === 0) return defaultRules();
  const hasDefault = record.rules.some((rule) => rule.workId === null && rule.unit === null);
  return hasDefault ? record.rules : [...record.rules, { ...DEFAULT_THRESHOLD }];
}
async function saveThresholds(objectId, rules) {
  const permissions = services$2().permissions;
  if (!(permissions && typeof permissions.canManageContours === "function" && permissions.canManageContours())) {
    return { ok: false, error: "Пороги сверки настраивает ПТО: у вашей роли нет права на правку объёмов" };
  }
  const storage2 = services$2().storage;
  if (!(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  if (!objectId) return { ok: false, error: "Не выбран объект" };
  const hasDefault = rules.some((rule) => rule.workId === null && rule.unit === null);
  if (!hasDefault) return { ok: false, error: "Общее правило обязательно: иначе нечего применить к остальным видам работ" };
  const author2 = permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
  await storage2.put(storeName$2(), {
    id: objectId,
    objectId,
    rules: rules.map((rule) => ({ ...rule })),
    updatedBy: author2,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: "pending"
  });
  return { ok: true };
}
function ruleTitle(rule, workName2) {
  if (rule.workId === null && rule.unit === null) return "Общее правило (для всех видов работ)";
  if (rule.workId === null) return `Единица измерения: ${rule.unit}`;
  return `${workName2(rule.workId)}${rule.unit ? ` · ${rule.unit}` : ""}`;
}
const NO_SORT = { key: null, dir: "asc" };
const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;
function isSortEmpty(value) {
  return value === null || value === void 0 || String(value).trim() === "";
}
function compareDecimalText(left, right) {
  const parse = (value) => {
    const negative = value.startsWith("-");
    const body = negative ? value.slice(1) : value;
    const [int, frac = ""] = body.split(".");
    return { negative, int: int.replace(/^0+(?=\d)/, ""), frac: frac.replace(/0+$/, "") };
  };
  const a = parse(left.trim());
  const b = parse(right.trim());
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const sign = a.negative ? -1 : 1;
  if (a.int.length !== b.int.length) return sign * (a.int.length - b.int.length);
  if (a.int !== b.int) return sign * (a.int < b.int ? -1 : 1);
  const width = Math.max(a.frac.length, b.frac.length);
  const leftFrac = a.frac.padEnd(width, "0");
  const rightFrac = b.frac.padEnd(width, "0");
  if (leftFrac === rightFrac) return 0;
  return sign * (leftFrac < rightFrac ? -1 : 1);
}
function compareValues(left, right) {
  const leftEmpty = isSortEmpty(left);
  const rightEmpty = isSortEmpty(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  const a = String(left).trim();
  const b = String(right).trim();
  if (DECIMAL_TEXT.test(a) && DECIMAL_TEXT.test(b)) return compareDecimalText(a, b);
  return a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });
}
function cycleSort(state2, key) {
  if (state2.key !== key) return { key, dir: "asc" };
  if (state2.dir === "asc") return { key, dir: "desc" };
  return { key: null, dir: "asc" };
}
function sortRows(rows, state2, value) {
  if (!state2.key) return rows.slice();
  const key = state2.key;
  return rows.map((row, index2) => ({ row, index: index2, value: value(row, key) })).sort((left, right) => {
    const leftEmpty = isSortEmpty(left.value);
    const rightEmpty = isSortEmpty(right.value);
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
    const base = compareValues(left.value, right.value);
    const ordered = state2.dir === "desc" ? -base : base;
    return ordered !== 0 ? ordered : left.index - right.index;
  }).map((item) => item.row);
}
function bindSortableTable(table, state2, onSort) {
  if (!table) return;
  table.querySelectorAll("th[data-sort-key]").forEach((cell) => {
    const key = cell.getAttribute("data-sort-key") || "";
    if (!key) return;
    const active = state2.key === key;
    cell.classList.add("cursor-pointer", "select-none");
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-sort", active ? state2.dir === "asc" ? "ascending" : "descending" : "none");
    cell.setAttribute("title", active ? "Нажмите, чтобы изменить направление сортировки" : "Нажмите, чтобы отсортировать по этой колонке");
    const indicator = document.createElement("span");
    indicator.setAttribute("data-sort-indicator", key);
    indicator.className = active ? "text-brand ml-1" : "text-muted ml-1 opacity-60";
    indicator.textContent = active ? state2.dir === "asc" ? "▲" : "▼" : "↕";
    cell.appendChild(indicator);
    const apply = () => onSort(cycleSort(state2, key));
    cell.addEventListener("click", apply);
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        apply();
      }
    });
  });
}
function sortableHeaderClass(active, extra = "") {
  return [extra, active ? "text-brand" : "", "cursor-pointer select-none"].filter(Boolean).join(" ");
}
const state$6 = {
  objectId: "",
  rows: [],
  sort: { ...NO_SORT },
  canEdit: false,
  canApprove: false,
  proposals: [],
  proposalRows: [],
  baselines: [],
  changes: [],
  audit: [],
  decisionReason: "",
  changeReason: "",
  thresholds: [],
  reconciliation: [],
  aggregates: [],
  works: [],
  thresholdDraft: null,
  newRuleWorkId: "",
  newRulePercent: "",
  editing: null,
  draft: "",
  note: "",
  error: "",
  busy: false
};
let pendingOpen = null;
function root$4() {
  return document.getElementById("pf-contours-root");
}
function escapeHtml$6(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function mountContoursPanel(objectId) {
  var _a, _b;
  if (!root$4()) return;
  if (state$6.objectId !== objectId) {
    state$6.objectId = objectId;
    state$6.note = "";
    state$6.error = "";
    state$6.editing = null;
    state$6.draft = "";
  }
  state$6.canEdit = canManageContours();
  try {
    const worRows = objectId ? await listWorRows(objectId) : [];
    const contours = objectId ? await listContours(objectId) : [];
    state$6.rows = buildContourRows(worRows, contours);
    state$6.canApprove = canApproveContours();
    state$6.thresholds = objectId ? await loadThresholds(objectId) : defaultRules();
    state$6.reconciliation = reconcileRows(state$6.rows, state$6.thresholds);
    state$6.aggregates = aggregateReconciliation(state$6.rows, state$6.thresholds);
    state$6.works = (await listWorks()).map((work) => ({ id: work.id, name: work.name }));
    state$6.thresholdDraft = {
      percent: ((_a = state$6.thresholds.find((rule) => rule.workId === null && rule.unit === null)) == null ? void 0 : _a.percent) ?? "5",
      absolute: ((_b = state$6.thresholds.find((rule) => rule.workId === null && rule.unit === null)) == null ? void 0 : _b.absolute) ?? "0"
    };
    state$6.proposals = objectId ? await listProposals(objectId) : [];
    state$6.baselines = objectId ? await listBaselines(objectId) : [];
    state$6.changes = objectId ? await listChangeRequests(objectId) : [];
    state$6.audit = await listAudit(8);
    const counts = /* @__PURE__ */ new Map();
    for (const proposal of state$6.proposals) {
      counts.set(proposal.id, (await listProposalRows(proposal.id)).length);
    }
    state$6.proposalRows = [...counts.entries()].map(([proposalId, count]) => ({ proposalId, count }));
  } catch (error) {
    state$6.error = error instanceof Error ? error.message : String(error);
    state$6.rows = [];
  }
  render$4();
}
const COLUMNS$1 = [
  { key: "place", title: "Этаж · помещение", value: (row) => row.place },
  { key: "work", title: "Работа", value: (row) => row.workRaw },
  { key: "unit", title: "ЕИ", value: (row) => row.unit },
  { key: "plan", title: "План", value: (row) => row.plan },
  ...CONTOURS.map((contour) => ({
    key: `contour:${contour.kind}`,
    title: contour.short,
    value: (row) => row.values[contour.kind]
  })),
  { key: "diff", title: "Предложено − договор", value: (row) => row.proposedMinusContract },
  { key: "state", title: "Состояние", value: (row) => row.filled }
];
function columnValue(row, key) {
  const column = COLUMNS$1.find((item) => item.key === key);
  return column ? column.value(row) : "";
}
function orderedRows() {
  return sortRows(state$6.rows, state$6.sort, columnValue);
}
function summaryHtml$1() {
  const completion = contourCompletion(state$6.rows);
  const card = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$6(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$6(value)}</div>
    </div>`;
  const total = Math.max(1, completion.total);
  const segments = [
    { label: "Заполнено полностью", value: completion.complete, tone: "bg-success" },
    { label: "Заполнено частично", value: completion.partial, tone: "bg-brand" },
    { label: "Пусто", value: completion.empty, tone: "bg-warning" }
  ].filter((segment) => segment.value > 0);
  const bar2 = `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div class="text-rbi-caption text-muted">Заполнение контуров по позициям</div>
        <div class="text-rbi-caption text-muted">${completion.complete} из ${completion.total} — полностью</div>
      </div>
      <div class="flex w-full h-3 rounded-full overflow-hidden border border-surface">
        ${segments.map((segment) => `<div class="${segment.tone} h-3"
          style="width:${Math.round(segment.value / total * 100)}%"
          title="${escapeHtml$6(`${segment.label}: ${segment.value}`)}"></div>`).join("") || '<div class="bg-surface h-3 w-full"></div>'}
      </div>
      <div class="flex flex-wrap gap-3 mt-1">
        ${segments.map((segment) => `<span class="text-rbi-caption text-muted">
          <span class="inline-block w-2 h-2 rounded-full ${segment.tone} mr-1"></span>${escapeHtml$6(segment.label)}: ${segment.value}
        </span>`).join("")}
        <span class="text-rbi-caption text-muted">контуров на позицию: ${CONTOURS.length}</span>
      </div>
    </div>`;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card("Позиций ВОР", String(completion.total))}
      ${card("Заполнено полностью", String(completion.complete), completion.complete > 0 ? "text-success" : "text-ink")}
      ${card("Заполнено частично", String(completion.partial), completion.partial > 0 ? "text-brand" : "text-ink")}
      ${card("Пусто", String(completion.empty), completion.empty > 0 ? "text-warning" : "text-ink")}
    </div>
    ${bar2}`;
}
function cellHtml(row, kind) {
  var _a, _b;
  const value = row.values[kind];
  const isEditing = ((_a = state$6.editing) == null ? void 0 : _a.worItemId) === row.worItemId && ((_b = state$6.editing) == null ? void 0 : _b.kind) === kind;
  const contour = CONTOURS.find((item) => item.kind === kind);
  const label = `${(contour == null ? void 0 : contour.short) ?? kind}: ${row.workRaw}, ${row.place}`;
  if (isEditing) {
    return `<td class="py-1 pr-3">
      <input id="pf-cell-input" type="text" inputmode="decimal" value="${escapeHtml$6(state$6.draft)}"
        aria-label="${escapeHtml$6(label)}" data-pf-cell-input
        class="w-24 bg-surface border border-brand text-ink text-rbi-caption rounded-lg px-2 py-1" />
    </td>`;
  }
  const shown = value === null ? '<span class="text-muted">не заполнено</span>' : escapeHtml$6(formatDecimal(value));
  if (!state$6.canEdit) {
    return `<td class="py-1 pr-3 text-rbi-caption text-ink" title="${escapeHtml$6(label)}">${shown}</td>`;
  }
  return `<td data-pf-cell="${escapeHtml$6(`${row.worItemId}|${kind}`)}" data-pf-kind="${escapeHtml$6(kind)}"
    tabindex="0" role="button"
    title="${escapeHtml$6(`${label} — нажмите, чтобы ввести объём`)}"
    class="py-1 pr-3 text-rbi-caption text-ink cursor-pointer hover:text-brand focus:text-brand focus:outline-none">${shown}</td>`;
}
function tableHtml$2() {
  if (state$6.rows.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-caption text-muted">В объекте нет сохранённой ВОР: сначала разберите форму
      заказчика в разделе «ВОР» — контуры вводятся по позициям плана.</div>
    </div>`;
  }
  const head = COLUMNS$1.map((column) => {
    const active = state$6.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml$6(column.key)}"
      class="${sortableHeaderClass(active, "py-1 pr-3 font-normal whitespace-nowrap")}">${escapeHtml$6(column.title)}</th>`;
  }).join("");
  const rows = orderedRows().slice(0, 300).map((row) => {
    const values = CONTOURS.map((contour) => cellHtml(row, contour.kind)).join("");
    const diff = row.proposedMinusContract === null ? '<span class="text-muted">—</span>' : `<span class="${row.proposedMinusContract.startsWith("-") ? "text-brand" : "text-danger"}">${escapeHtml$6(formatDecimal(row.proposedMinusContract))}</span>`;
    const plan = row.plan === null ? '<span class="text-muted">не заполнено</span>' : escapeHtml$6(formatDecimal(row.plan));
    return `
      <tr class="border-b border-surface" data-pf-row="${escapeHtml$6(row.worItemId)}">
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml$6(row.place)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$6(row.workRaw)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$6(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${plan}</td>
        ${values}
        <td class="py-1 pr-3 text-rbi-caption">${diff}</td>
        <td class="py-1 text-rbi-caption ${row.filled === 0 ? "text-muted" : row.incomplete ? "text-brand" : "text-success"}">
          <div class="flex items-center gap-1.5">
            <span class="flex gap-0.5">${CONTOURS.map((contour) => `<span
              class="inline-block w-2.5 h-2.5 rounded-sm ${row.values[contour.kind] !== null ? "bg-brand" : "bg-border-surface"}"
              title="${escapeHtml$6(`${contour.short}: ${row.values[contour.kind] !== null ? "заполнено" : "пусто"}`)}"></span>`).join("")}</span>
            <span class="whitespace-nowrap">${row.filled} из ${CONTOURS.length}</span>
          </div>
        </td>
      </tr>`;
  }).join("");
  const more = state$6.rows.length > 300 ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые 300 позиций из ${state$6.rows.length}
       по текущей сортировке.</div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Контуры объёмов по позициям</div>
      <table id="pf-contours-table" class="w-full min-w-[900px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
    </div>`;
}
function hintHtml() {
  if (!state$6.canEdit) {
    return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Объёмы по контурам ведёт ПТО: у вашей роли права на правку
      нет, таблица ниже — для чтения. Факт вносится в разделе «Прораб».</span>
    </div>`;
  }
  return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
    <span class="text-rbi-caption text-muted">
      Нажмите на ячейку контура и введите объём: <b>Enter</b> — сохранить и перейти к следующей строке,
      <b>Tab</b> — к следующему контуру, <b>Esc</b> — отменить. Пустая ячейка — это «не заполнено»,
      а не ноль: очистить контур можно, стерев значение и нажав Enter.
    </span>
  </div>`;
}
function approvalHtml() {
  var _a;
  const proposalRowsToSend = state$6.rows.filter((row) => row.values.PROPOSED !== null);
  const pending = state$6.proposals.find((proposal) => proposal.status === "submitted") ?? null;
  const baseline = currentBaseline(state$6.baselines);
  const diff = baselineDiff(baseline, state$6.rows.map((row) => ({ worItemId: row.worItemId, values: row.values })));
  state$6.changes.filter((change) => change.status === "created" || change.status === "checked");
  const pendingBlock = pending ? `<div class="border-t border-surface pt-2 mt-2">
        <div class="text-rbi-body text-ink">На утверждении: «${escapeHtml$6(pending.title)}»
          · строк: ${((_a = state$6.proposalRows.find((item) => item.proposalId === pending.id)) == null ? void 0 : _a.count) ?? 0}
          · предложил ${escapeHtml$6(pending.submittedBy || "—")}</div>
        ${state$6.canApprove ? `
          <div class="flex flex-wrap items-end gap-2 mt-2">
            <label class="flex flex-col gap-1 flex-1 min-w-[220px]">
              <span class="text-rbi-label text-muted">Причина решения (для отказа обязательна)</span>
              <input id="pf-decision-reason" type="text" value="${escapeHtml$6(state$6.decisionReason)}"
                class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
            </label>
            <button type="button" id="pf-approve"
              class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Утвердить</button>
            <button type="button" id="pf-reject"
              class="text-rbi-body font-bold text-danger border border-surface px-3 py-1.5 rounded-xl">Отклонить</button>
          </div>` : `<div class="text-rbi-caption text-muted mt-1">Решение принимает РП: у вашей роли права утверждать нет.</div>`}
      </div>` : "";
  const baselineBlock = baseline ? `<div class="text-rbi-caption text-muted mt-2">
        Действующий baseline: принят ${escapeHtml$6(String(baseline.approvedAt).slice(0, 16).replace("T", " "))}
        · ${escapeHtml$6(baseline.approvedBy || "—")} · ревизия ${baseline.snapshot.revision ?? 1}
        · строк ${baseline.snapshot.rows.length}
        ${diff.length ? ` · <span class="text-danger">расходится с контурами в ${diff.length} строках</span>` : " · совпадает с контурами"}
      </div>` : `<div class="text-rbi-caption text-muted mt-2">Утверждённого baseline нет: «Утверждено РП» заполняется после утверждения.</div>`;
  const diffBlock = diff.length && state$6.canEdit ? `<div class="mt-2">
        <div class="text-rbi-caption text-danger mb-1">Расхождения с утверждённым (изменение — только через запрос):</div>
        <ul class="list-none p-0 m-0">
          ${diff.slice(0, 6).map((item) => `
            <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
              <span class="text-rbi-caption text-ink">${escapeHtml$6(item.worItemId)}</span>
              <span class="text-rbi-caption text-muted">утверждено ${escapeHtml$6(item.approved)} → сейчас
                ${item.current === null ? "не заполнено" : escapeHtml$6(item.current)}</span>
              <button type="button" data-pf-change-request="${escapeHtml$6(item.worItemId)}"
                class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Запросить изменение</button>
            </li>`).join("")}
        </ul>
        <label class="flex flex-col gap-1 mt-2">
          <span class="text-rbi-label text-muted">Причина изменения (обязательна)</span>
          <input id="pf-change-reason" type="text" value="${escapeHtml$6(state$6.changeReason)}"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
      </div>` : "";
  const changesBlock = state$6.changes.length ? `<div class="mt-2">
        <div class="text-rbi-caption text-muted mb-1">Запросы на изменение (${state$6.changes.length}):</div>
        <ul class="list-none p-0 m-0">
          ${state$6.changes.slice(0, 5).map((change) => `
            <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
              <span class="text-rbi-caption text-ink">${escapeHtml$6(change.worItemId)}</span>
              <span class="text-rbi-caption text-muted">${change.qtyBefore === null ? "—" : escapeHtml$6(change.qtyBefore)} → ${escapeHtml$6(change.qtyAfter)}</span>
              <span class="text-rbi-caption ${change.status === "effective" ? "text-brand" : "text-danger"}">${escapeHtml$6(change.status)}</span>
              <span class="text-rbi-caption text-muted">${escapeHtml$6(change.reason)}</span>
              ${state$6.canApprove && (change.status === "created" || change.status === "checked") ? `<button type="button" data-pf-change-approve="${escapeHtml$6(change.id)}"
                    class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Утвердить изменение</button>
                   <button type="button" data-pf-change-reject="${escapeHtml$6(change.id)}"
                    class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Отклонить</button>` : ""}
            </li>`).join("")}
        </ul>
      </div>` : "";
  const auditBlock = state$6.audit.length ? `<div class="text-rbi-caption text-muted mt-2">Журнал: ${state$6.audit.map(
    (record) => `${escapeHtml$6(record.action)} ${escapeHtml$6(record.entity)} (${escapeHtml$6(record.actor || "—")}, ${escapeHtml$6(String(record.createdAt).slice(5, 16).replace("T", " "))})`
  ).join(" · ")}</div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Утверждение объёмов
        <span class="text-rbi-caption text-muted font-normal">· ПТО предлагает, РП утверждает, baseline неизменяем</span></div>
      ${state$6.canEdit ? `
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="pf-propose" ${proposalRowsToSend.length && !pending ? "" : "disabled"}
            class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">
            Предложить утверждение</button>
          <span class="text-rbi-caption text-muted">
            ${pending ? "Предложение уже на утверждении — дождитесь решения РП." : proposalRowsToSend.length ? `Уйдёт строк: ${proposalRowsToSend.length} — объёмы из контура «Предложено ПТО».` : "Сначала заполните контур «Предложено ПТО»."}
          </span>
        </div>` : `<div class="text-rbi-caption text-muted">Предложение готовит ПТО, решение принимает РП.</div>`}
      ${pendingBlock}
      ${baselineBlock}
      ${diffBlock}
      ${changesBlock}
      ${auditBlock}
    </div>`;
}
function bindApproval(container) {
  var _a, _b, _c, _d, _e;
  const buttons = [
    "#pf-propose",
    "#pf-approve",
    "#pf-reject",
    "[data-pf-change-request]",
    "[data-pf-change-approve]",
    "[data-pf-change-reject]"
  ];
  for (const selector of buttons) {
    container.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("mousedown", () => {
        state$6.editing = null;
        state$6.draft = "";
      });
    });
  }
  (_a = container.querySelector("#pf-decision-reason")) == null ? void 0 : _a.addEventListener("input", (event) => {
    state$6.decisionReason = event.target.value;
  });
  (_b = container.querySelector("#pf-change-reason")) == null ? void 0 : _b.addEventListener("input", (event) => {
    state$6.changeReason = event.target.value;
  });
  (_c = container.querySelector("#pf-propose")) == null ? void 0 : _c.addEventListener("click", () => {
    void runPropose();
  });
  (_d = container.querySelector("#pf-approve")) == null ? void 0 : _d.addEventListener("click", () => {
    void runDecision("approved");
  });
  (_e = container.querySelector("#pf-reject")) == null ? void 0 : _e.addEventListener("click", () => {
    void runDecision("rejected");
  });
  container.querySelectorAll("[data-pf-change-request]").forEach((button) => {
    button.addEventListener("click", () => {
      void runChangeRequest(button.getAttribute("data-pf-change-request") ?? "");
    });
  });
  container.querySelectorAll("[data-pf-change-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      void runChangeDecision(button.getAttribute("data-pf-change-approve") ?? "", "approved");
    });
  });
  container.querySelectorAll("[data-pf-change-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      void runChangeDecision(button.getAttribute("data-pf-change-reject") ?? "", "rejected");
    });
  });
}
function cancelCellEdit() {
  state$6.editing = null;
  state$6.draft = "";
}
async function runPropose() {
  cancelCellEdit();
  state$6.error = "";
  state$6.note = "";
  const rows = state$6.rows.filter((row) => row.values.PROPOSED !== null).map((row) => ({
    worItemId: row.worItemId,
    quantity: String(row.values.PROPOSED),
    workRaw: row.workRaw,
    place: row.place
  }));
  const result = await proposeContours({ objectId: state$6.objectId, rows });
  const message = result.ok ? `Предложение отправлено на утверждение РП: строк ${rows.length}.` : result.error ?? "Не удалось отправить предложение";
  await mountContoursPanel(state$6.objectId);
  if (result.ok) state$6.note = message;
  else state$6.error = message;
  render$4();
}
async function runDecision(decision) {
  var _a, _b;
  cancelCellEdit();
  const pending = state$6.proposals.find((proposal) => proposal.status === "submitted");
  if (!pending) return;
  state$6.error = "";
  state$6.note = "";
  const result = await decideProposal({ proposalId: pending.id, decision, reason: state$6.decisionReason });
  const message = !result.ok ? result.error ?? "Не удалось принять решение" : decision === "approved" ? `Утверждено: baseline ревизии ${((_a = result.baseline) == null ? void 0 : _a.snapshot.revision) ?? 1}, строк ${((_b = result.baseline) == null ? void 0 : _b.snapshot.rows.length) ?? 0}. Контур «Утверждено РП» заполнен из baseline.` : "Предложение отклонено — причина записана в журнал.";
  state$6.decisionReason = "";
  await mountContoursPanel(state$6.objectId);
  if (result.ok) state$6.note = message;
  else state$6.error = message;
  render$4();
}
async function runChangeRequest(worItemId) {
  var _a, _b;
  cancelCellEdit();
  const row = state$6.rows.find((item) => item.worItemId === worItemId);
  if (!row) return;
  const target = row.values.APPROVED;
  if (target === null) {
    state$6.error = "В контуре «Утверждено РП» нет значения: сначала утвердите объём";
    render$4();
    return;
  }
  state$6.error = "";
  state$6.note = "";
  const result = await requestChange({
    objectId: state$6.objectId,
    worItemId,
    kind: "APPROVED",
    qtyAfter: target,
    reason: state$6.changeReason,
    workRaw: row.workRaw,
    place: row.place
  });
  const message = result.ok ? `Запрос на изменение создан: ${((_a = result.record) == null ? void 0 : _a.qtyBefore) ?? "—"} → ${(_b = result.record) == null ? void 0 : _b.qtyAfter}. Ждёт решения РП.` : result.error ?? "Не удалось создать запрос на изменение";
  state$6.changeReason = "";
  await mountContoursPanel(state$6.objectId);
  if (result.ok) state$6.note = message;
  else state$6.error = message;
  render$4();
}
async function runChangeDecision(id, decision) {
  var _a;
  cancelCellEdit();
  state$6.error = "";
  state$6.note = "";
  const result = await decideChangeRequest({
    id,
    decision,
    reason: decision === "rejected" ? state$6.changeReason || "отклонено без пояснения" : state$6.changeReason
  });
  const message = !result.ok ? result.error ?? "Не удалось принять решение по изменению" : decision === "approved" ? `Изменение утверждено: новый baseline ревизии ${((_a = result.baseline) == null ? void 0 : _a.snapshot.revision) ?? "—"}. Прежний baseline остался неизменным.` : "Изменение отклонено: утверждённый объём остался прежним.";
  state$6.changeReason = "";
  await mountContoursPanel(state$6.objectId);
  if (result.ok) state$6.note = message;
  else state$6.error = message;
  render$4();
}
function reconcileHtml() {
  var _a, _b;
  const summary = reconciliationSummary(state$6.reconciliation);
  const warnings = state$6.reconciliation.filter((row) => row.status === "warning").sort((left, right) => Math.abs(Number(right.percent ?? 0)) - Math.abs(Number(left.percent ?? 0)));
  const workName2 = (workId) => {
    var _a2;
    return ((_a2 = state$6.works.find((work) => work.id === workId)) == null ? void 0 : _a2.name) ?? workId;
  };
  const card = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$6(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$6(value)}</div>
    </div>`;
  const rules = state$6.thresholds.map((rule, index2) => {
    const isDefault = rule.workId === null && rule.unit === null;
    return `
      <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
        <span class="text-rbi-caption text-ink">${escapeHtml$6(ruleTitle(rule, workName2))}</span>
        <span class="text-rbi-caption text-muted">порог: ${escapeHtml$6(rule.percent)}% и ${escapeHtml$6(rule.absolute)} ед.
          ${isDefault ? "· общее правило" : ""}</span>
        ${state$6.canEdit && !isDefault ? `<button type="button" data-pf-rule-remove="${index2}"
          class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Убрать</button>` : ""}
      </li>`;
  }).join("");
  const editor = state$6.canEdit ? `<div class="flex flex-wrap items-end gap-2 mt-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Общий порог, %</span>
          <input id="pf-threshold-percent" type="text" inputmode="decimal" value="${escapeHtml$6(((_a = state$6.thresholdDraft) == null ? void 0 : _a.percent) ?? "5")}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Общий порог, единицы</span>
          <input id="pf-threshold-absolute" type="text" inputmode="decimal" value="${escapeHtml$6(((_b = state$6.thresholdDraft) == null ? void 0 : _b.absolute) ?? "0")}"
            class="w-28 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Вид работ для своего порога</span>
          <select id="pf-threshold-work"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 max-w-[260px]">
            <option value="">— выберите вид работ —</option>
            ${state$6.works.map((work) => `<option value="${escapeHtml$6(work.id)}"${work.id === state$6.newRuleWorkId ? " selected" : ""}>${escapeHtml$6(work.name)}</option>`).join("")}
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Порог, %</span>
          <input id="pf-threshold-work-percent" type="text" inputmode="decimal" value="${escapeHtml$6(state$6.newRulePercent)}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-threshold-add"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Добавить правило</button>
        <button type="button" id="pf-thresholds-save"
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Сохранить пороги</button>
      </div>` : `<div class="text-rbi-caption text-muted mt-2">Пороги настраивает ПТО: у вашей роли права на правку нет.</div>`;
  const warningRows = warnings.slice(0, 12).map((row) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml$6(row.place)}</td>
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$6(row.workRaw)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml$6(row.pair)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml$6(formatDecimal(String(row.left)))} → ${escapeHtml$6(formatDecimal(String(row.right)))}</td>
      <td class="py-1 pr-3 text-rbi-caption text-danger whitespace-nowrap">${escapeHtml$6(String(row.absolute))} · ${escapeHtml$6(String(row.percent))}%</td>
      <td class="py-1 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml$6(row.threshold.percent)}% / ${escapeHtml$6(row.threshold.absolute)} ед.</td>
    </tr>`).join("");
  const aggregateRows = state$6.aggregates.slice(0, 10).map((item) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$6(item.workRaw)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml$6(item.pair)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml$6(item.leftSum)} → ${escapeHtml$6(item.rightSum)}</td>
      <td class="py-1 text-rbi-caption ${item.status === "warning" ? "text-danger" : "text-muted"} whitespace-nowrap">${escapeHtml$6(item.absolute)} · ${escapeHtml$6(item.percent)}%</td>
    </tr>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сверка контуров
        <span class="text-rbi-caption text-muted font-normal">· РД ↔ договор ↔ предложено, пороги по видам работ</span></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        ${card("Выше порога", String(summary.warnings), summary.warnings ? "text-danger" : "text-ink")}
        ${card("В пределах порога", String(summary.ok))}
        ${card("Не с чем сравнивать", String(summary.incomplete))}
        ${card("Всего сравнений", String(summary.total))}
      </div>
      ${summary.incomplete > 0 ? `<div class="text-rbi-caption text-muted mb-2">
        «Не с чем сравнивать» — это пустые контуры: пустое значение не считается нулём.</div>` : ""}
      <ul class="list-none p-0 m-0">${rules}</ul>
      ${editor}
      ${warnings.length ? `
        <div class="text-rbi-caption text-danger mt-3 mb-1">Расхождения выше порога (${warnings.length}):</div>
        <div class="overflow-x-auto">
          <table id="pf-reconcile-table" class="w-full min-w-[720px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              <th class="py-1 pr-3 font-normal">Помещение</th><th class="py-1 pr-3 font-normal">Работа</th>
              <th class="py-1 pr-3 font-normal">Пара</th><th class="py-1 pr-3 font-normal">Было → стало</th>
              <th class="py-1 pr-3 font-normal">Разница</th><th class="py-1 font-normal">Порог</th>
            </tr></thead>
            <tbody>${warningRows}</tbody>
          </table>
        </div>
        ${warnings.length > 12 ? `<div class="text-rbi-caption text-muted mt-1">Показаны первые 12 из ${warnings.length}.</div>` : ""}` : ""}
      ${state$6.aggregates.length ? `
        <div class="text-rbi-caption text-muted mt-3 mb-1">По видам работ (агрегаты):</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[600px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              <th class="py-1 pr-3 font-normal">Вид работ</th><th class="py-1 pr-3 font-normal">Пара</th>
              <th class="py-1 pr-3 font-normal">Суммы</th><th class="py-1 font-normal">Разница</th>
            </tr></thead>
            <tbody>${aggregateRows}</tbody>
          </table>
        </div>` : ""}
    </div>`;
}
function bindReconcile(container) {
  var _a, _b, _c, _d, _e, _f;
  (_a = container.querySelector("#pf-threshold-percent")) == null ? void 0 : _a.addEventListener("input", (event) => {
    state$6.thresholdDraft = { ...state$6.thresholdDraft ?? { percent: "5", absolute: "0" }, percent: event.target.value };
  });
  (_b = container.querySelector("#pf-threshold-absolute")) == null ? void 0 : _b.addEventListener("input", (event) => {
    state$6.thresholdDraft = { ...state$6.thresholdDraft ?? { percent: "5", absolute: "0" }, absolute: event.target.value };
  });
  (_c = container.querySelector("#pf-threshold-work")) == null ? void 0 : _c.addEventListener("change", (event) => {
    state$6.newRuleWorkId = event.target.value;
  });
  (_d = container.querySelector("#pf-threshold-work-percent")) == null ? void 0 : _d.addEventListener("input", (event) => {
    state$6.newRulePercent = event.target.value;
  });
  (_e = container.querySelector("#pf-thresholds-save")) == null ? void 0 : _e.addEventListener("click", () => {
    void runSaveThresholds();
  });
  (_f = container.querySelector("#pf-threshold-add")) == null ? void 0 : _f.addEventListener("click", () => {
    void runAddRule();
  });
  container.querySelectorAll("[data-pf-rule-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const index2 = Number(button.getAttribute("data-pf-rule-remove"));
      void runRemoveRule(index2);
    });
  });
}
async function runSaveThresholds() {
  var _a, _b;
  cancelCellEdit();
  const percent = parseThresholdInput((_a = state$6.thresholdDraft) == null ? void 0 : _a.percent, "percent");
  const absolute = parseThresholdInput((_b = state$6.thresholdDraft) == null ? void 0 : _b.absolute, "absolute");
  if (!percent.ok || !absolute.ok) {
    state$6.error = percent.error ?? absolute.error ?? "Порог введён неверно";
    render$4();
    return;
  }
  const others = state$6.thresholds.filter((rule) => !(rule.workId === null && rule.unit === null));
  const rules = [
    { workId: null, unit: null, percent: percent.value, absolute: absolute.value },
    ...others
  ];
  const saved = await saveThresholds(state$6.objectId, rules);
  if (!saved.ok) {
    state$6.error = saved.error ?? "Не удалось сохранить пороги";
    render$4();
    return;
  }
  await mountContoursPanel(state$6.objectId);
  state$6.note = `Пороги сохранены: общий ${percent.value}% и ${absolute.value} ед. Расхождений выше порога: ${reconciliationSummary(state$6.reconciliation).warnings}.`;
  render$4();
}
async function runAddRule() {
  var _a;
  cancelCellEdit();
  if (!state$6.newRuleWorkId) {
    state$6.error = "Выберите вид работ для своего порога";
    render$4();
    return;
  }
  const value = parseThresholdInput(state$6.newRulePercent, "percent");
  if (!value.ok) {
    state$6.error = value.error ?? "Порог введён неверно";
    render$4();
    return;
  }
  const rules = [
    ...state$6.thresholds.filter((rule) => rule.workId !== state$6.newRuleWorkId),
    { workId: state$6.newRuleWorkId, unit: null, percent: value.value, absolute: "0" }
  ];
  const saved = await saveThresholds(state$6.objectId, rules);
  if (!saved.ok) {
    state$6.error = saved.error ?? "Не удалось сохранить правило";
    render$4();
    return;
  }
  const workName2 = ((_a = state$6.works.find((work) => work.id === state$6.newRuleWorkId)) == null ? void 0 : _a.name) ?? state$6.newRuleWorkId;
  state$6.newRuleWorkId = "";
  state$6.newRulePercent = "";
  await mountContoursPanel(state$6.objectId);
  state$6.note = `Свой порог для «${workName2}»: ${value.value}%.`;
  render$4();
}
async function runRemoveRule(index2) {
  cancelCellEdit();
  const rules = state$6.thresholds.filter((_rule, position) => position !== index2);
  const saved = await saveThresholds(state$6.objectId, rules);
  if (!saved.ok) {
    state$6.error = saved.error ?? "Не удалось убрать правило";
    render$4();
    return;
  }
  await mountContoursPanel(state$6.objectId);
  state$6.note = "Правило убрано: к этому виду работ применяется общий порог.";
  render$4();
}
function render$4() {
  const container = root$4();
  if (!container) return;
  container.innerHTML = `
    ${hintHtml()}
    ${state$6.note ? `<div class="text-rbi-caption text-brand mb-3">${escapeHtml$6(state$6.note)}</div>` : ""}
    ${state$6.error ? `<div class="text-rbi-body text-danger mb-3">${escapeHtml$6(state$6.error)}</div>` : ""}
    ${summaryHtml$1()}
    <div id="pf-reconcile">${reconcileHtml()}</div>
    <div id="pf-approval">${approvalHtml()}</div>
    ${tableHtml$2()}
  `;
  bind$5();
}
function bind$5() {
  const container = root$4();
  if (!container) return;
  bindSortableTable(container.querySelector("#pf-contours-table"), state$6.sort, (next) => {
    state$6.sort = next;
    state$6.editing = null;
    render$4();
  });
  bindReconcile(container);
  bindApproval(container);
  container.querySelectorAll("[data-pf-cell]").forEach((cell) => {
    const target = () => {
      const [worItemId, kind] = String(cell.getAttribute("data-pf-cell") || "").split("|");
      return worItemId && kind ? { worItemId, kind } : null;
    };
    cell.addEventListener("mousedown", (event) => {
      event.preventDefault();
      pendingOpen = target();
    });
    cell.addEventListener("click", () => {
      void openCell(target());
    });
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pendingOpen = target();
        void openCell(target());
      }
    });
  });
  const input = container.querySelector("[data-pf-cell-input]");
  if (input) {
    input.focus();
    input.select();
    input.addEventListener("input", () => {
      state$6.draft = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commit("down");
      } else if (event.key === "Tab") {
        event.preventDefault();
        void commit(event.shiftKey ? "left" : "right");
      } else if (event.key === "Escape") {
        event.preventDefault();
        state$6.editing = null;
        state$6.draft = "";
        render$4();
      }
    });
    input.addEventListener("blur", () => {
      if (state$6.busy || pendingOpen) return;
      const cell = state$6.editing;
      if (!cell) return;
      setTimeout(() => {
        if (state$6.editing === cell && !state$6.busy) void commit(null);
      }, 0);
    });
  }
}
async function openCell(target) {
  var _a, _b;
  pendingOpen = null;
  if (!target || state$6.busy) return;
  const sameCell = ((_a = state$6.editing) == null ? void 0 : _a.worItemId) === target.worItemId && ((_b = state$6.editing) == null ? void 0 : _b.kind) === target.kind;
  if (state$6.editing && !sameCell) {
    await commit(null);
  }
  startEdit(target.worItemId, target.kind);
}
function startEdit(worItemId, kind) {
  if (!state$6.canEdit) return;
  const row = state$6.rows.find((item) => item.worItemId === worItemId);
  if (!row) return;
  state$6.editing = { worItemId, kind };
  state$6.draft = row.values[kind] ?? "";
  state$6.note = "";
  state$6.error = "";
  render$4();
}
function nextCell(direction) {
  if (!state$6.editing || !direction) return null;
  const editing = state$6.editing;
  const rows = orderedRows();
  const rowIndex = rows.findIndex((row) => row.worItemId === editing.worItemId);
  if (rowIndex < 0) return null;
  const kindIndex = CONTOURS.findIndex((contour) => contour.kind === editing.kind);
  if (direction === "down") {
    const next = rows[rowIndex + 1];
    return next ? { worItemId: next.worItemId, kind: editing.kind } : null;
  }
  const step = direction === "right" ? 1 : -1;
  const neighbour = CONTOURS[kindIndex + step];
  if (neighbour) return { worItemId: editing.worItemId, kind: neighbour.kind };
  const nextRow = rows[rowIndex + step];
  if (!nextRow) return null;
  const edge = step > 0 ? CONTOURS[0] : CONTOURS[CONTOURS.length - 1];
  return { worItemId: nextRow.worItemId, kind: edge.kind };
}
async function commit(direction) {
  const editing = state$6.editing;
  if (!editing || state$6.busy) return;
  const value = state$6.draft;
  const wasEmpty = value.trim() === "";
  const target = nextCell(direction);
  state$6.busy = true;
  state$6.editing = null;
  state$6.error = "";
  state$6.note = "";
  try {
    const result = wasEmpty ? await clearContour(editing.worItemId, editing.kind) : await setContour({
      worItemId: editing.worItemId,
      objectId: state$6.objectId,
      kind: editing.kind,
      quantity: value
    });
    if (!result.ok) {
      state$6.error = result.error ?? "Не удалось сохранить контур";
    } else {
      const contour = CONTOURS.find((item) => item.kind === editing.kind);
      const row = state$6.rows.find((item) => item.worItemId === editing.worItemId);
      state$6.note = wasEmpty ? `${(contour == null ? void 0 : contour.short) ?? editing.kind}: «${(row == null ? void 0 : row.workRaw) ?? ""}» — пусто, контур снят (это не ноль)` : `${(contour == null ? void 0 : contour.short) ?? editing.kind}: ${value.trim().replace(".", ",")} — ${(row == null ? void 0 : row.workRaw) ?? ""}`;
    }
  } catch (error) {
    state$6.error = error instanceof Error ? error.message : String(error);
  }
  state$6.busy = false;
  state$6.draft = "";
  await mountContoursPanel(state$6.objectId);
  if (target && !state$6.error) {
    const row = state$6.rows.find((item) => item.worItemId === target.worItemId);
    if (row) {
      state$6.editing = target;
      state$6.draft = row.values[target.kind] ?? "";
      render$4();
    }
  }
}
const state$5 = {
  works: [],
  aliases: [],
  canEdit: false,
  editingId: "",
  search: "",
  sort: { ...NO_SORT },
  aliasSort: { ...NO_SORT },
  note: "",
  error: "",
  busy: false
};
function root$3() {
  return document.getElementById("pf-works-root");
}
function escapeHtml$5(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function mountWorksPanel() {
  if (!root$3()) return;
  state$5.canEdit = canManageWorks();
  try {
    state$5.works = await listWorks();
    state$5.aliases = await listAliases();
  } catch (error) {
    state$5.error = error instanceof Error ? error.message : String(error);
    state$5.works = [];
    state$5.aliases = [];
  }
  render$3();
}
const WORK_COLUMNS = [
  { key: "name", title: "Вид работ", value: (row) => row.name },
  { key: "unit", title: "ЕИ", value: (row) => row.unit },
  { key: "group", title: "Группа", value: (row) => row.groupName },
  { key: "stage", title: "Этап", value: (row) => row.stage },
  { key: "source", title: "Источник", value: (row) => row.source === "pto" ? "задал ПТО" : "начальное наполнение" },
  { key: "revision", title: "Версия", value: (row) => row.revision }
];
const ALIAS_COLUMNS = [
  { key: "alias", title: "Название в форме", value: (row) => row.alias },
  { key: "work", title: "Вид работ", value: (row) => workName(row.workId) },
  { key: "source", title: "Откуда", value: (row) => row.source === "form" ? "из формы" : "связал ПТО" }
];
function workName(workId) {
  var _a;
  return ((_a = state$5.works.find((work) => work.id === workId)) == null ? void 0 : _a.name) ?? workId;
}
function filteredWorks() {
  const needle = state$5.search.trim().toLowerCase();
  const base = needle ? state$5.works.filter((work) => `${work.name} ${work.groupName} ${work.code}`.toLowerCase().includes(needle)) : state$5.works;
  return sortRows(base, state$5.sort, (row, key) => {
    const column = WORK_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : "";
  });
}
function summaryHtml() {
  const pto = state$5.works.filter((work) => work.source === "pto").length;
  const card = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$5(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$5(value)}</div>
    </div>`;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card("Видов работ", String(state$5.works.length))}
      ${card("Заведено ПТО", String(pto))}
      ${card("Связок названий", String(state$5.aliases.length))}
      ${card("Справочник", "компании")}
    </div>`;
}
function editorHtml() {
  if (!state$5.canEdit) {
    return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Справочник ведёт ПТО: у вашей роли права на правку нет,
      таблица ниже — для чтения.</span>
    </div>`;
  }
  const editing = state$5.works.find((work) => work.id === state$5.editingId) ?? null;
  const unitOptions = UNITS.map((unit) => `<option value="${escapeHtml$5(unit.code)}"${(editing == null ? void 0 : editing.unit) === unit.code ? " selected" : ""}>${escapeHtml$5(`${unit.title} (${unit.code})`)}</option>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">
        ${editing ? `Правка вида работ: ${escapeHtml$5(editing.name)}` : "Новый вид работ"}
        <span class="text-rbi-caption text-muted font-normal">· справочник компании, влияет на все объекты</span>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1 flex-1 min-w-[220px]">
          <span class="text-rbi-label text-muted">Название</span>
          <input id="pf-work-name" type="text" value="${escapeHtml$5((editing == null ? void 0 : editing.name) ?? "")}"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Единица</span>
          <select id="pf-work-unit"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${unitOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Группа</span>
          <input id="pf-work-group" type="text" value="${escapeHtml$5((editing == null ? void 0 : editing.groupName) ?? "")}"
            class="w-32 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Этап</span>
          <input id="pf-work-stage" type="text" value="${escapeHtml$5((editing == null ? void 0 : editing.stage) ?? "")}"
            class="w-32 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span class="text-rbi-label text-muted">Правило расчёта</span>
          <input id="pf-work-rule" type="text" value="${escapeHtml$5((editing == null ? void 0 : editing.calcRule) ?? "")}"
            placeholder="например: периметр × высота − проёмы"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-work-save" ${state$5.busy ? "disabled" : ""}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">
          ${editing ? "Сохранить" : "Добавить"}</button>
        ${editing ? `<button type="button" id="pf-work-cancel"
          class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Отмена</button>` : ""}
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        Правка увеличивает версию записи — видно, что методика менялась. Убрать вид работ можно в архив:
        запись останется в истории, но из списка уйдёт.
      </div>
    </div>`;
}
function tableHtml$1() {
  const rows = filteredWorks();
  if (rows.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-caption text-muted">Ничего не найдено${state$5.search ? ` по запросу «${escapeHtml$5(state$5.search)}»` : ""}.</div>
    </div>`;
  }
  const head = WORK_COLUMNS.map((column) => {
    const active = state$5.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml$5(column.key)}"
      class="${sortableHeaderClass(active, "py-1 pr-3 font-normal whitespace-nowrap")}">${escapeHtml$5(column.title)}</th>`;
  }).join("");
  const body = rows.slice(0, 400).map((work) => `
    <tr class="border-b border-surface" data-pf-work="${escapeHtml$5(work.id)}">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$5(work.name)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$5(work.unit)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$5(work.groupName)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$5(work.stage)}</td>
      <td class="py-1 pr-3 text-rbi-caption ${work.source === "pto" ? "text-brand" : "text-muted"}">
        ${work.source === "pto" ? "задал ПТО" : "начальное наполнение"}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${work.revision}</td>
      <td class="py-1 whitespace-nowrap">
        ${state$5.canEdit ? `
          <button type="button" data-pf-work-edit="${escapeHtml$5(work.id)}"
            class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Изменить</button>
          <button type="button" data-pf-work-archive="${escapeHtml$5(work.id)}"
            class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">В архив</button>` : ""}
      </td>
    </tr>`).join("");
  const more = rows.length > 400 ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые 400 из ${rows.length}.</div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="text-rbi-body font-bold text-ink">Виды работ (${rows.length})</div>
        <input id="pf-work-search" type="text" value="${escapeHtml$5(state$5.search)}" placeholder="поиск по названию, группе, коду"
          class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 w-64" />
      </div>
      <table id="pf-works-table" class="w-full min-w-[820px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}
          <th class="py-1 font-normal"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${more}
    </div>`;
}
function aliasesHtml() {
  if (state$5.aliases.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Связки названий</div>
      <div class="text-rbi-caption text-muted">Связок пока нет. Они появляются, когда в разделе «ВОР»
      формулировку из формы связывают с видом работ.</div>
    </div>`;
  }
  const sorted = sortRows(state$5.aliases, state$5.aliasSort, (row, key) => {
    const column = ALIAS_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : "";
  });
  const head = ALIAS_COLUMNS.map((column) => {
    const active = state$5.aliasSort.key === column.key;
    return `<th data-sort-key="${escapeHtml$5(column.key)}"
      class="${sortableHeaderClass(active, "py-1 pr-3 font-normal")}">${escapeHtml$5(column.title)}</th>`;
  }).join("");
  const body = sorted.map((alias) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$5(alias.alias)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$5(workName(alias.workId))}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${alias.source === "form" ? "из формы" : "связал ПТО"}</td>
      <td class="py-1">${state$5.canEdit ? `<button type="button" data-pf-alias-remove="${escapeHtml$5(alias.id)}"
        class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Снять</button>` : ""}</td>
    </tr>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Связки названий (${state$5.aliases.length})</div>
      <table id="pf-aliases-table" class="w-full min-w-[640px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}
          <th class="py-1 font-normal"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}
function render$3() {
  const container = root$3();
  if (!container) return;
  container.innerHTML = `
    ${state$5.note ? `<div class="text-rbi-caption text-brand mb-3">${escapeHtml$5(state$5.note)}</div>` : ""}
    ${state$5.error ? `<div class="text-rbi-body text-danger mb-3">${escapeHtml$5(state$5.error)}</div>` : ""}
    ${summaryHtml()}
    ${editorHtml()}
    ${tableHtml$1()}
    ${aliasesHtml()}
  `;
  bind$4();
}
function field(id) {
  var _a, _b;
  return ((_b = (_a = root$3()) == null ? void 0 : _a.querySelector(id)) == null ? void 0 : _b.value) ?? "";
}
function bind$4() {
  var _a, _b, _c;
  const container = root$3();
  if (!container) return;
  bindSortableTable(container.querySelector("#pf-works-table"), state$5.sort, (next) => {
    state$5.sort = next;
    render$3();
  });
  bindSortableTable(container.querySelector("#pf-aliases-table"), state$5.aliasSort, (next) => {
    state$5.aliasSort = next;
    render$3();
  });
  (_a = container.querySelector("#pf-work-search")) == null ? void 0 : _a.addEventListener("input", (event) => {
    state$5.search = event.target.value;
    render$3();
  });
  const unitSelect = container.querySelector("#pf-work-unit");
  (_b = container.querySelector("#pf-work-save")) == null ? void 0 : _b.addEventListener("click", () => {
    void runSaveWork((unitSelect == null ? void 0 : unitSelect.value) ?? "");
  });
  (_c = container.querySelector("#pf-work-cancel")) == null ? void 0 : _c.addEventListener("click", () => {
    state$5.editingId = "";
    state$5.note = "";
    state$5.error = "";
    render$3();
  });
  container.querySelectorAll("[data-pf-work-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state$5.editingId = button.getAttribute("data-pf-work-edit") ?? "";
      state$5.note = "";
      state$5.error = "";
      render$3();
    });
  });
  container.querySelectorAll("[data-pf-work-archive]").forEach((button) => {
    button.addEventListener("click", () => {
      void runArchive(button.getAttribute("data-pf-work-archive") ?? "");
    });
  });
  container.querySelectorAll("[data-pf-alias-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      void runRemoveAlias(button.getAttribute("data-pf-alias-remove") ?? "");
    });
  });
}
async function runSaveWork(unit) {
  var _a, _b, _c;
  const input = {
    name: field("#pf-work-name"),
    unit,
    groupName: field("#pf-work-group"),
    stage: field("#pf-work-stage"),
    calcRule: field("#pf-work-rule")
  };
  state$5.busy = true;
  state$5.error = "";
  state$5.note = "";
  render$3();
  try {
    const result = await saveWork({
      id: state$5.editingId || void 0,
      name: input.name,
      unit: input.unit,
      groupName: input.groupName,
      stage: input.stage,
      calcRule: input.calcRule
    });
    if (!result.ok) {
      state$5.error = result.error ?? "Не удалось сохранить вид работ";
    } else {
      state$5.note = `Сохранено: «${(_a = result.record) == null ? void 0 : _a.name}», версия ${(_b = result.record) == null ? void 0 : _b.revision}.` + (((_c = result.record) == null ? void 0 : _c.source) === "pto" ? " Теперь это запись ПТО, а не начальное наполнение." : "");
      state$5.editingId = "";
    }
  } catch (error) {
    state$5.error = error instanceof Error ? error.message : String(error);
  }
  state$5.busy = false;
  await mountWorksPanel();
}
async function runArchive(id) {
  state$5.busy = true;
  state$5.error = "";
  state$5.note = "";
  try {
    const result = await archiveWork(id);
    if (!result.ok) state$5.error = result.error ?? "Не удалось убрать вид работ";
    else state$5.note = "Вид работ убран в архив: из списка он уйдёт, история останется.";
  } catch (error) {
    state$5.error = error instanceof Error ? error.message : String(error);
  }
  state$5.busy = false;
  await mountWorksPanel();
}
async function runRemoveAlias(id) {
  state$5.busy = true;
  state$5.error = "";
  state$5.note = "";
  try {
    const result = await removeAlias(id);
    if (!result.ok) state$5.error = result.error ?? "Не удалось снять связку";
    else state$5.note = "Связка снята: формулировка снова будет требовать решения.";
  } catch (error) {
    state$5.error = error instanceof Error ? error.message : String(error);
  }
  state$5.busy = false;
  await mountWorksPanel();
}
function sumWithGaps(values) {
  const known = values.filter((value) => value !== null && value !== "");
  if (known.length === 0) {
    return { value: null, filled: 0, missing: values.length, partial: values.length > 0 };
  }
  return {
    value: sumDecimal(known),
    filled: known.length,
    missing: values.length - known.length,
    partial: known.length !== values.length
  };
}
function completionPercent(fact, plan) {
  if (fact === null || plan === null) return null;
  if (compareDecimal(plan, "0") <= 0) return null;
  const raw = divideDecimal(scaleByPowerOfTen(fact, 2), plan, 6);
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [integer, fraction = ""] = body.split(".");
  return `${negative ? "-" : ""}${integer === "" ? "0" : integer}.${fraction.slice(0, 1).padEnd(1, "0")}`;
}
function showDecimal(value, digits = 2) {
  if (value === null || value === "") return "—";
  return formatDecimal(value, digits);
}
function showPercent(value) {
  if (value === null || value === "") return "—";
  return `${value.replace(".", ",")} %`;
}
function buildDashboard(objects, maxNotes = 4) {
  const plan = sumWithGaps(objects.map((object) => object.plan));
  const fact = sumWithGaps(objects.map((object) => object.fact));
  const totals = {
    objects: objects.length,
    positions: objects.reduce((sum, object) => sum + object.positions, 0),
    plan,
    fact,
    // Процент по проекту считаем из сумм: иначе «средний процент» по объектам вводил бы в заблуждение.
    factPercent: completionPercent(fact.value, plan.value),
    aboveThreshold: objects.reduce((sum, object) => sum + (object.aboveThreshold ?? 0), 0),
    needsDecision: objects.reduce((sum, object) => sum + object.needsDecision, 0),
    pendingProposals: objects.filter((object) => object.proposalPending).length,
    openChanges: objects.reduce((sum, object) => sum + object.openChanges, 0)
  };
  const notes = [];
  if (objects.length === 0) {
    notes.push("Объектов не видно: проверьте доступы роли — пустой список здесь означает «нет прав», а не «нет работ».");
  }
  if (plan.value === null && objects.length > 0) {
    notes.push("План не заполнен ни по одному объекту: сначала разберите формы заказчика в разделе «ВОР».");
  } else if (plan.partial) {
    notes.push(`План неполный: заполнено ${plan.filled} из ${plan.filled + plan.missing} объектов.`);
  }
  if (fact.value === null && objects.length > 0) {
    notes.push("Факт не внесён ни по одному объекту: раздел «Прораб» — там факт вносят прорабы.");
  } else if (fact.partial) {
    notes.push(`Факт неполный: заполнено ${fact.filled} из ${fact.filled + fact.missing} объектов.`);
  }
  const incomparable = objects.reduce((sum, object) => sum + object.incomparable, 0);
  if (incomparable > 0) {
    notes.push(`Пар сверки «не с чем сравнивать»: ${incomparable} — контуры заполнены не везде, это не «ноль расхождений».`);
  }
  const unconfirmed = objects.reduce((sum, object) => sum + object.unconfirmedNorms, 0);
  if (unconfirmed > 0) {
    notes.push(`Норм без подтверждения ПТО: ${unconfirmed}.`);
  }
  if (totals.pendingProposals > 0) {
    notes.push(`Ждут решения РП: предложений — ${totals.pendingProposals}, изменений — ${totals.openChanges}.`);
  }
  const unitNames = [...new Set(objects.flatMap((object) => object.units.map((entry) => entry.unit)))].filter((unit) => unit !== "").sort((left, right) => left.localeCompare(right, "ru"));
  const byUnit = unitNames.map((unit) => {
    const plans = [];
    const facts = [];
    let positions = 0;
    for (const object of objects) {
      const entry = object.units.find((item) => item.unit === unit);
      if (!entry) continue;
      plans.push(entry.plan);
      facts.push(entry.fact);
      positions += entry.positions;
    }
    return { unit, plan: sumWithGaps(plans), fact: sumWithGaps(facts), positions };
  });
  const workGroups = /* @__PURE__ */ new Map();
  for (const object of objects) {
    for (const work of object.works) {
      const key = `${work.workId ?? work.workRaw}|${work.unit}`;
      const group = workGroups.get(key) ?? {
        workId: work.workId,
        workRaw: work.workRaw,
        unit: work.unit,
        plans: [],
        facts: []
      };
      if (work.plan !== null) group.plans.push(work.plan);
      if (work.fact !== null) group.facts.push(work.fact);
      workGroups.set(key, group);
    }
  }
  const topWorks = [...workGroups.values()].map((group) => ({
    workId: group.workId,
    workRaw: group.workRaw,
    unit: group.unit,
    plan: group.plans.length ? sumDecimal(group.plans) : null,
    fact: group.facts.length ? sumDecimal(group.facts) : null
  })).sort((left, right) => compareDecimal(right.plan ?? "0", left.plan ?? "0")).slice(0, 12);
  if (byUnit.length > 1) {
    notes.push(`Объёмы показаны раздельно по единицам измерения (${byUnit.map((entry) => entry.unit).join(", ")}): складывать м² с м.п. и штуками в одно число нельзя.`);
  }
  return { objects, totals, byUnit, topWorks, notes: notes.slice(0, maxNotes + 1) };
}
function barWidth(part, whole) {
  if (part === null || whole === null) return null;
  if (compareDecimal(whole, "0") <= 0) return null;
  const raw = divideDecimal(scaleByPowerOfTen(part, 2), whole, 2);
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}
function reconcileSegments(summary) {
  const total = summary.warnings + summary.ok + summary.incomplete;
  const share = (value) => total > 0 ? Math.round(value / total * 100) : 0;
  return [
    { label: "Выше порога", value: summary.warnings, share: share(summary.warnings), tone: "danger" },
    { label: "В пределах порога", value: summary.ok, share: share(summary.ok), tone: "brand" },
    { label: "Не с чем сравнивать", value: summary.incomplete, share: share(summary.incomplete), tone: "muted" }
  ];
}
function planFactGap(plan, fact) {
  if (plan === null || fact === null) return null;
  return addDecimal(plan, fact.startsWith("-") ? fact.slice(1) : `-${fact}`);
}
const LOCATION_RULES = [
  { id: "loc-section", pattern: "^Секц\\S*\\s*([\\d.]+)", target: "section", group: 1 },
  { id: "loc-floor", pattern: "^Этаж\\s*([\\d.]+)", target: "floor", group: 1 },
  { id: "loc-room-kio", pattern: "^КИО$", target: "room" },
  { id: "loc-zone-mop", pattern: "^МОП", target: "zone" },
  // Обмерная матрица: помещение задано голым номером квартиры («2», «15а»).
  { id: "loc-room-number", pattern: "^\\d+\\s*[а-я]?$", target: "room" }
];
const MATRIX_WORKS = [
  { columnIndex: 98, headerText: "Штукатурка гипсовая 10-20мм", unitRaw: "S, м2" },
  { columnIndex: 99, headerText: "Штукатурка цеметная", unitRaw: "S, м2" },
  { columnIndex: 100, headerText: "Шпаклёвка", unitRaw: "S, м2" },
  { columnIndex: 101, headerText: "Обои", unitRaw: "S, м2" },
  { columnIndex: 102, headerText: "Окраска обои", unitRaw: "S, м2" },
  { columnIndex: 103, headerText: "Плинтус", unitRaw: "м.пог." },
  { columnIndex: 104, headerText: "Ламинат", unitRaw: "S, м2" },
  { columnIndex: 105, headerText: "Натяжной потолок", unitRaw: "S, м2" },
  { columnIndex: 106, headerText: "Подшивной потолок", unitRaw: "S, м2" },
  { columnIndex: 107, headerText: "Плитка стен СУ", unitRaw: "S, м2" },
  { columnIndex: 108, headerText: "Пороги (в с/у)", unitRaw: "м.пог." },
  { columnIndex: 109, headerText: "Плитка пола СУ", unitRaw: "S, м2" },
  { columnIndex: 110, headerText: "Плитка балкон", unitRaw: "S, м3" },
  { columnIndex: 111, headerText: "Откосы S, м2 Гипрок", unitRaw: "S, м2" }
];
const MATRIX_COLUMNS = [
  { field: "section_floor", columnIndex: 1, headerText: "Секция" },
  { field: "code", columnIndex: 2, headerText: "Этаж" },
  { field: "location_label", columnIndex: 3, headerText: "Квартира" },
  // Reader кладёт в эти колонки заголовок и значение колонки-работы: имя вида работ,
  // единицу из второй строки шапки и объём из строки помещения.
  { field: "name", columnIndex: 100, headerText: "колонка-работа" },
  { field: "unit", columnIndex: 102, headerText: "единица колонки-работы" },
  { field: "quantity", columnIndex: 101, headerText: "объём колонки-работы" }
];
const LIST_COLUMNS = [
  { field: "code", columnIndex: 1, headerText: "№ п/п" },
  { field: "name", columnIndex: 2, headerText: "Наименование работ" },
  { field: "unit", columnIndex: 3, headerText: "Ед. изм." },
  { field: "norm_consumption", columnIndex: 4, headerText: "Норма расхода" },
  { field: "quantity", columnIndex: 5, headerText: "Объём" }
];
const MATRIX_WORKS_2 = [
  { columnIndex: 106, headerText: "Штукатурка гипсовая 10-20мм", unitRaw: "S, м2" },
  { columnIndex: 107, headerText: "Штукатурка цеметная", unitRaw: "S, м2" },
  { columnIndex: 108, headerText: "Обои", unitRaw: "S, м2" },
  { columnIndex: 109, headerText: "Окраска обои", unitRaw: "S, м2" },
  { columnIndex: 110, headerText: "Плинтус", unitRaw: "м.пог." },
  { columnIndex: 111, headerText: "Ламинат", unitRaw: "S, м2" },
  { columnIndex: 112, headerText: "Плитка стен СУ", unitRaw: "S, м2" },
  { columnIndex: 113, headerText: "Плитка пола СУ", unitRaw: "S, м2" },
  { columnIndex: 114, headerText: "Натяжной потолок", unitRaw: "S, м2" },
  { columnIndex: 115, headerText: "Подшивной потолок", unitRaw: "S, м2" },
  { columnIndex: 116, headerText: "Пороги (в с/у)", unitRaw: "м.пог." },
  { columnIndex: 117, headerText: "Плитка балкон", unitRaw: "S, м2" }
];
const MATRIX_COLUMNS_2 = [
  { field: "section_floor", columnIndex: 1, headerText: "Секция" },
  { field: "code", columnIndex: 2, headerText: "Этаж" },
  { field: "location_label", columnIndex: 3, headerText: "Квартира" },
  { field: "name", columnIndex: 105, headerText: "колонка-работа" },
  { field: "unit", columnIndex: 107, headerText: "единица колонки-работы" },
  { field: "quantity", columnIndex: 106, headerText: "объём колонки-работы" }
];
const FORM_PROFILES = [
  {
    id: "sputnik-matrix",
    title: "Обмерная матрица (Спутник): строка = помещение",
    matrix: true,
    profile: {
      id: "p-sputnik-matrix",
      name: "Расчёт 1 секции Квартиры",
      layout: "measurement_matrix",
      headerRow: 1,
      headerRows: 2,
      columns: MATRIX_COLUMNS,
      locationRules: LOCATION_RULES,
      works: MATRIX_WORKS
    }
  },
  {
    id: "sputnik-matrix-2",
    title: "Обмерная матрица, 2 секция (Спутник): другой состав колонок",
    matrix: true,
    profile: {
      id: "p-sputnik-matrix-2",
      name: "Расчёт 2 секция",
      layout: "measurement_matrix",
      headerRow: 1,
      headerRows: 2,
      columns: MATRIX_COLUMNS_2,
      locationRules: LOCATION_RULES,
      works: MATRIX_WORKS_2
    }
  },
  {
    id: "fkp-list",
    title: "Плоский список (ФКП 142): локации строками, материалы отдельно",
    matrix: false,
    profile: {
      id: "p-fkp-list",
      name: "ФКП, 142",
      layout: "outline_location_rows",
      headerRow: 7,
      headerRows: 3,
      columns: LIST_COLUMNS,
      locationRules: LOCATION_RULES,
      works: [{ columnIndex: 2, headerText: "Корпус" }, { columnIndex: 2, headerText: "Комплекс работ" }],
      sheetPattern: "ФКП"
    }
  }
];
function formProfileById(id) {
  return FORM_PROFILES.find((form) => form.id === id) ?? null;
}
function normalizeContextOf(form) {
  return {
    units: UNITS,
    works: WORKS,
    aliases: WORK_ALIASES,
    columns: form.profile.columns,
    locationRules: form.profile.locationRules
  };
}
function unresolvedWorks(rows) {
  const byName = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.workId !== null) continue;
    const raw = String(row.workRaw ?? "").trim();
    if (!raw) continue;
    const entry = byName.get(raw) ?? { raw, count: 0, units: /* @__PURE__ */ new Set() };
    entry.count += 1;
    if (row.unitRaw) entry.units.add(String(row.unitRaw));
    byName.set(raw, entry);
  }
  return [...byName.values()].map((entry) => ({ raw: entry.raw, count: entry.count, units: [...entry.units].sort() })).sort((left, right) => right.count - left.count || left.raw.localeCompare(right.raw, "ru"));
}
function percentTenths(value, total) {
  if (total <= 0) return 0;
  const scaled = (BigInt(value) * 1000n + BigInt(Math.floor(total / 2))) / BigInt(total);
  return Number(scaled) / 10;
}
function pathPart(item, part) {
  const index2 = part === "section" ? 0 : 1;
  return item.locationPath[index2] ?? "";
}
function autoMatchedWorks(rows, aliases) {
  const confirmed = new Set(
    aliases.filter((alias) => alias.source === "pto").map((alias) => alias.normalizedAlias)
  );
  const byName = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.workId === null) continue;
    const key = normalizeWorkName(row.workRaw);
    if (!key || confirmed.has(key)) continue;
    const entry = byName.get(key) ?? { raw: row.workRaw, workId: row.workId, count: 0, workTitle: row.workRaw };
    entry.count += 1;
    byName.set(key, entry);
  }
  return [...byName.values()].sort((left, right) => right.count - left.count || left.raw.localeCompare(right.raw, "ru"));
}
function toWorRow(item, form) {
  var _a;
  if (item.quantity === null) return null;
  const section = item.locationRoles ? item.locationRoles.section || "—" : pathPart(item, "section") || "—";
  const floor = item.locationRoles ? item.locationRoles.floor || "—" : pathPart(item, "floor") || "—";
  const place = ((_a = item.locationRoles) == null ? void 0 : _a.place) ?? (item.locationPath[item.locationPath.length - 1] ?? "");
  return {
    section,
    floor,
    // В плоском списке помещение не задано — работа идёт «по договору» (как в исходной форме).
    place: form.matrix ? place : place || "по договору",
    workRaw: item.workRaw,
    workId: item.workId,
    workMatch: item.workMatch,
    matchReason: matchReason(item.workRaw, item.workId),
    unitRaw: item.unitRaw,
    unit: item.unit,
    quantity: item.quantity,
    fragment: item.fragment
  };
}
function assembleResult(items, issues, counters, form, sheetName = "") {
  const usable = items.filter((item) => item.quantity !== null);
  const matched = usable.filter((item) => item.workId !== null);
  const worRows = usable.map((item) => toWorRow(item, form)).filter((row) => row !== null);
  const stats = {
    sheet: sheetName || form.profile.name,
    rows: counters.rowsTotal,
    items: usable.length,
    matched: matched.length,
    matchedPercent: percentTenths(matched.length, usable.length),
    materialsSkipped: counters.materialsSkipped,
    unresolvedWorks: counters.unresolvedWorks,
    unresolvedLocations: counters.unresolvedLocations,
    needsDecision: usable.length - matched.length,
    issues: issues.slice(0, 20).map((issue) => ({
      code: issue.code,
      message: issue.message,
      row: issue.fragment.row
    }))
  };
  return { rows: worRows, stats, issues };
}
function analyze(rows, form, context) {
  var _a;
  const result = normalizeRows(rows, context ?? normalizeContextOf(form));
  return assembleResult(result.items, result.issues, result.stats, form, ((_a = rows[0]) == null ? void 0 : _a.sheet) ?? "");
}
function totalsByWork(rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, bucket]) => ({
    workKey: key,
    workTitle: bucket[0].workRaw,
    unit: bucket[0].unitRaw || bucket[0].unit || "",
    // Сумма — точно, на строках (см. decimal.ts); форматирование делает интерфейс.
    quantity: bucket.reduce((acc, row) => addDecimal(acc, row.quantity), "0")
  }));
}
const EMPTY = "";
function sheetJs() {
  const lib = window.XLSX;
  if (!lib || typeof lib.read !== "function") {
    throw new Error("SheetJS (libs/xlsx.full.min.js) не загружен — чтение XLSX невозможно");
  }
  return lib;
}
function toCell(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}
function readXlsxSheets(input) {
  const lib = sheetJs();
  const buffer = input instanceof Uint8Array ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) : input;
  const workbook = lib.read(buffer, { type: "array" });
  return workbook.SheetNames.map((name) => {
    const raw = lib.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true
    });
    return { name, rows: raw.map((row) => row.map(toCell)) };
  });
}
function countFormulaCells(input) {
  const lib = sheetJs();
  const buffer = input instanceof Uint8Array ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) : input;
  const workbook = lib.read(buffer, { type: "array" });
  let formulas = 0;
  const sheets = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    let inSheet = 0;
    for (const key of Object.keys(sheet)) {
      if (key.startsWith("!")) continue;
      if (sheet[key] && typeof sheet[key].f === "string") inSheet += 1;
    }
    if (inSheet > 0) sheets.push(name);
    formulas += inSheet;
  }
  return { formulas, sheets };
}
function text(value) {
  if (value === null || value === void 0) return EMPTY;
  if (typeof value === "boolean") return EMPTY;
  return String(value).replace(/\s+/g, " ").trim();
}
function columnIndex(profile, field2) {
  const mapping = profile.columns.find((column) => column.field === field2);
  return mapping && mapping.columnIndex >= 1 ? mapping.columnIndex : null;
}
function cellAt(row, index2) {
  if (index2 === null) return null;
  return row[index2 - 1] ?? null;
}
function isFilled(value) {
  if (value === null || value === void 0) return false;
  return typeof value === "number" ? value !== 0 : text(value) !== EMPTY;
}
function dataStartRow(profile) {
  return profile.headerRow + Math.max(1, profile.headerRows);
}
function matrixRows(sheet, profile, records) {
  const sectionIndex = columnIndex(profile, "section_floor");
  const rows = [];
  for (const [offset, record] of records.entries()) {
    const rowNumber = dataStartRow(profile) + offset;
    const section = text(cellAt(record, sectionIndex));
    const floor = text(cellAt(record, columnIndex(profile, "code")));
    const place = text(cellAt(record, columnIndex(profile, "location_label")));
    for (const work of profile.works ?? []) {
      const quantityIndex = columnIndex(profile, "quantity") ?? work.columnIndex;
      const quantity = record[work.columnIndex - 1] ?? null;
      if (quantity === null || quantity === "") continue;
      const cells = [];
      const nameIndex = columnIndex(profile, "name");
      if (nameIndex !== null) cells[nameIndex - 1] = work.headerText;
      const unitIndex = columnIndex(profile, "unit");
      if (unitIndex !== null && work.unitRaw) cells[unitIndex - 1] = work.unitRaw;
      cells[quantityIndex - 1] = quantity;
      rows.push({
        sheet,
        rowNumber,
        cells,
        locationContext: [section, floor, place].filter((part) => part !== EMPTY),
        marker: null
      });
    }
  }
  return rows;
}
function outlineRows(sheet, profile, records) {
  const nameIndex = columnIndex(profile, "name");
  const consumptionIndex = columnIndex(profile, "norm_consumption");
  const rules = profile.locationRules.map((rule) => new RegExp(rule.pattern, "i"));
  const context = [];
  const rows = [];
  for (const [offset, record] of records.entries()) {
    const rowNumber = dataStartRow(profile) + offset;
    const name = text(cellAt(record, nameIndex));
    if (!name) continue;
    const isZone = (profile.works ?? []).some((work) => name.includes(work.headerText));
    if (rules.some((rule) => rule.test(name)) || isZone) {
      context.push(name);
      continue;
    }
    if (!isFilled(cellAt(record, columnIndex(profile, "unit"))) || !isFilled(cellAt(record, columnIndex(profile, "quantity")))) {
      continue;
    }
    const normConsumption = text(cellAt(record, consumptionIndex));
    const material = normConsumption !== EMPTY && Number.isFinite(Number(normConsumption.replace(",", ".")));
    rows.push({
      sheet,
      rowNumber,
      cells: [...record],
      locationContext: [...context],
      marker: material ? "М" : null
    });
  }
  return rows;
}
function buildRawRows(sheetCells, profile, sheetName) {
  const sheet = sheetName ?? profile.name;
  const records = sheetCells.slice(dataStartRow(profile) - 1);
  if (profile.layout === "measurement_matrix") return matrixRows(sheet, profile, records);
  return outlineRows(sheet, profile, records);
}
function pickSheet(sheets, profile) {
  if (sheets.length === 0) return null;
  const byName = sheets.find((sheet) => sheet.name === profile.name);
  if (byName) return byName;
  if (profile.sheetPattern) {
    const re = new RegExp(profile.sheetPattern, "i");
    const byPattern = sheets.find((sheet) => re.test(sheet.name));
    if (byPattern) return byPattern;
  }
  return sheets[0];
}
function rawRowsFromSheets(sheets, profile, sheetName) {
  const sheet = sheetName ? sheets.find((item) => item.name === sheetName) ?? pickSheet(sheets, profile) : pickSheet(sheets, profile);
  if (!sheet) return [];
  return buildRawRows(sheet.rows, profile, sheet.name);
}
const DEMO_WORKS = [
  { name: "Штукатурка стен", unit: "м2" },
  { name: "Окраска стен", unit: "м2" },
  { name: "Плинтус", unit: "м.п." },
  { name: "Устройство покрытия пола из ламината", unit: "м2" },
  { name: "Облицовка стен керамогранитом (с/у)", unit: "м2" },
  { name: "Устройство натяжных ПВХ потолков", unit: "м2" }
];
function demoSheet() {
  const rows = [["Этаж", "Помещение", "Наименование работ", "Ед. изм.", "Объём", "Примечание"]];
  const byFloor = {
    "2": [DEMO_WORKS[0], DEMO_WORKS[1], DEMO_WORKS[2]],
    "3": [DEMO_WORKS[3], DEMO_WORKS[4], DEMO_WORKS[5]]
  };
  let index2 = 0;
  for (const floor of ["2", "3"]) {
    for (let flat = 1; flat <= 4; flat += 1) {
      for (let work = 0; work < 3; work += 1) {
        const item = byFloor[floor][work];
        const quantity = 12 + (index2 * 7 + flat * 3) % 40;
        rows.push([floor, `кв. ${flat}`, item.name, item.unit, String(quantity), ""]);
        index2 += 1;
      }
    }
  }
  return { name: "Демо-ВОР", rows };
}
function demoProfile() {
  const form = formProfileById("fkp-list");
  if (!form) throw new Error("Профиль разбора не найден — обновите страницу");
  const columns = [
    { field: "section_floor", columnIndex: 1, headerText: "Этаж" },
    { field: "location_label", columnIndex: 2, headerText: "Помещение" },
    { field: "name", columnIndex: 3, headerText: "Наименование работ" },
    { field: "unit", columnIndex: 4, headerText: "Ед. изм." },
    { field: "quantity", columnIndex: 5, headerText: "Объём" }
  ];
  return { profile: { ...form.profile, headerRow: 1, headerRows: 1, columns, sheetPattern: void 0 }, form };
}
function demoAnalysis() {
  const { profile, form } = demoProfile();
  const sheet = demoSheet();
  const rows = rawRowsFromSheets([sheet], profile, sheet.name);
  const context = normalizeContextOf({ ...form, profile });
  const analysis = analyze(rows, { ...form, profile }, context);
  return { analysis, profile, form, sheet };
}
function services$1() {
  const rbi = window.RBI;
  return (rbi == null ? void 0 : rbi.services) ?? {};
}
function storeName$1(key) {
  var _a, _b, _c, _d;
  const stores = (_d = (_c = (_b = (_a = window.RBI) == null ? void 0 : _a.services) == null ? void 0 : _b.storage) == null ? void 0 : _c.stores) == null ? void 0 : _d.call(_c);
  const name = stores == null ? void 0 : stores[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу`);
  return name;
}
async function seedDemo(objectName = "Демо-объект: ЖК Северный, корпус 1") {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const api = services$1();
  if (!((_a = api.locations) == null ? void 0 : _a.createNode) || !((_b = api.storage) == null ? void 0 : _b.put)) {
    throw new Error("Демо-данные недоступны: сервисы платформы не загрузились");
  }
  const storage2 = api.storage;
  const node = await api.locations.createNode({ nodeType: "object", displayName: objectName });
  await ((_d = (_c = api.objects) == null ? void 0 : _c.rebuildFromLocations) == null ? void 0 : _d.call(_c));
  try {
    const assigned = ((_f = (_e = api.permissions) == null ? void 0 : _e.getAssignedProjects) == null ? void 0 : _f.call(_e)) ?? [];
    if (!assigned.includes(node.id)) {
      const next = [...assigned, node.id];
      await ((_h = (_g = api.settings) == null ? void 0 : _g.set) == null ? void 0 : _h.call(_g, "assignedProjects", next));
    }
  } catch (_error) {
  }
  const { analysis, profile, form } = demoAnalysis();
  if (analysis.rows.length === 0) {
    throw new Error("Демо-ВОР не разобрался — сообщите об ошибке, данные объекта созданы");
  }
  const saved = await saveImport({
    objectId: node.id,
    filename: "Демо-ВОР (синтетические данные).xlsx",
    profileId: profile.id,
    profileTitle: `${form.title} · демо`,
    rows: analysis.rows,
    stats: analysis.stats
  });
  const rows = await Promise.resolve().then(() => store).then((module) => module.listWorRows(node.id));
  const contourStore = storeName$1("PLAN_FACT_QUANTITIES");
  const putContour = async (row, kind, quantity) => {
    await storage2.put(contourStore, {
      id: `pfqty_demo_${row.id}_${kind}`,
      objectId: node.id,
      worItemId: row.id,
      kind,
      quantity: String(quantity),
      source: "демо",
      method: "демо",
      note: "",
      updatedBy: "Демо",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      syncStatus: "pending"
    });
  };
  for (const [index2, row] of rows.entries()) {
    const plan = Number(row.quantity);
    const round = (value) => Math.round(value * 100) / 100;
    const state2 = index2 % 5;
    if (state2 === 0) continue;
    await putContour(row, "CONTRACT", plan);
    await putContour(row, "PROPOSED", round(plan * (state2 === 1 ? 1.15 : 1.03)));
    if (state2 >= 2) await putContour(row, "RD", round(plan * 1.12));
    if (state2 >= 3) {
      await putContour(row, "APPROVED", plan);
      await putContour(row, "CUSTOMER_ACCEPTED", round(plan * 0.95));
    }
  }
  const proposalStore = storeName$1("PLAN_FACT_PROPOSALS");
  const proposalRowStore = storeName$1("PLAN_FACT_PROPOSAL_ROWS");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const proposalId = `pfprop_demo_${node.id}`;
  await storage2.put(proposalStore, {
    id: proposalId,
    objectId: node.id,
    title: "Демо: объёмы на утверждение",
    status: "submitted",
    submittedBy: "Демо",
    submittedAt: now,
    decidedBy: "",
    decidedAt: null,
    decisionReason: "",
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending"
  });
  for (const [index2, row] of rows.slice(0, 6).entries()) {
    await storage2.put(proposalRowStore, {
      id: `pfprow_demo_${index2}_${row.id}`,
      proposalId,
      worItemId: row.id,
      quantity: String(Number(row.quantity)),
      note: "",
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending"
    });
  }
  const factsStore = storeName$1("PLAN_FACT_FACTS");
  for (const [index2, row] of rows.entries()) {
    if (index2 % 4 !== 0) continue;
    await storage2.put(factsStore, {
      id: `pffact_demo_${row.id}`,
      objectId: node.id,
      section: row.section,
      floor: row.floor,
      place: row.place,
      workKey: row.workId,
      workRaw: row.workRaw,
      unit: row.unit,
      quantity: String(Math.round(Number(row.quantity) * 0.4 * 100) / 100),
      factDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      comment: "Демо-данные",
      author: "Демо",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      syncStatus: "pending"
    });
  }
  return { objectId: node.id, objectName, importId: saved.importId, positions: analysis.rows.length };
}
const OBJECT_LIMIT = 20;
const state$4 = {
  digest: null,
  objectsSeen: 0,
  audit: [],
  sort: { ...NO_SORT },
  loading: false,
  error: "",
  note: "",
  seeding: false,
  unit: "",
  showTable: false
};
function root$2() {
  return document.getElementById("pf-dashboard-root");
}
function escapeHtml$4(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function digestOf(object) {
  const objectId = object.id;
  const [worRows, contours, facts, imports, proposals, baselines, changes, norms, thresholds] = await Promise.all([
    listWorRows(objectId),
    listContours(objectId),
    listFacts(objectId),
    listImports(objectId),
    listProposals(objectId),
    listBaselines(objectId),
    listChangeRequests(objectId),
    listNorms(),
    loadThresholds(objectId)
  ]);
  const contourRows = buildContourRows(worRows, contours);
  const completion = contourCompletion(contourRows);
  const reconciliation = reconciliationSummary(reconcileRows(contourRows, thresholds));
  const sumValues = (values) => values.length > 0 ? sumDecimal(values) : null;
  const sumByKind = (kind) => sumValues(contours.filter((row) => row.kind === kind && !row.isDeleted).map((row) => row.quantity));
  const plan = sumValues(worRows.map((row) => String(row.quantity)).filter((value) => value !== ""));
  const fact = sumValues(
    activeFacts(facts).filter((record) => record.quantity !== null && record.quantity !== void 0).map((record) => String(record.quantity))
  );
  const liveFacts = activeFacts(facts);
  const unitOf = (row) => String(row.unit || row.unitRaw || "");
  const unitNames = [...new Set([
    ...worRows.map((row) => unitOf(row)),
    ...liveFacts.map((record) => String(record.unit || ""))
  ].filter((unit) => unit !== ""))];
  const units = unitNames.map((unit) => {
    const rowsForUnit = worRows.filter((row) => unitOf(row) === unit);
    const factsForUnit = liveFacts.filter((record) => String(record.unit || "") === unit);
    return {
      unit,
      plan: sumValues(rowsForUnit.map((row) => String(row.quantity)).filter((value) => value !== "")),
      fact: sumValues(factsForUnit.map((record) => String(record.quantity))),
      positions: rowsForUnit.length
    };
  }).sort((left, right) => right.positions - left.positions);
  const workGroups = /* @__PURE__ */ new Map();
  for (const row of worRows) {
    const unit = unitOf(row);
    const key = `${row.workId ?? row.workRaw}|${unit}`;
    const group = workGroups.get(key) ?? { workId: row.workId, workRaw: row.workRaw, unit, plans: [], facts: [] };
    group.plans.push(String(row.quantity));
    workGroups.set(key, group);
  }
  for (const record of liveFacts) {
    const unit = String(record.unit || "");
    const key = `${record.workKey ?? record.workRaw}|${unit}`;
    const group = workGroups.get(key);
    if (group) group.facts.push(String(record.quantity));
  }
  const works = [...workGroups.values()].map((group) => ({
    workId: group.workId,
    workRaw: group.workRaw,
    unit: group.unit,
    plan: group.plans.length ? sumDecimal(group.plans) : null,
    fact: group.facts.length ? sumDecimal(group.facts) : null
  })).sort((left, right) => Number(right.plan ?? 0) - Number(left.plan ?? 0)).slice(0, 20);
  const lastImportAt = imports.map((record) => String(record.createdAt ?? "")).filter((value) => value !== "").sort().reverse()[0] ?? null;
  return {
    objectId,
    objectName: objectDisplayName(object) || objectId,
    positions: worRows.length,
    plan,
    contract: sumByKind("CONTRACT"),
    proposed: sumByKind("PROPOSED"),
    approved: sumByKind("APPROVED"),
    accepted: sumByKind("CUSTOMER_ACCEPTED"),
    fact,
    // Процент есть только когда есть и план, и факт: без плана процента не бывает.
    factPercent: completionPercent(fact, plan),
    needsDecision: worRows.filter((row) => row.workId === null).length,
    contoursIncomplete: completion.incomplete,
    aboveThreshold: reconciliation.total > 0 ? reconciliation.warnings : null,
    incomparable: reconciliation.incomplete,
    // Подтверждение нормы — это её автор: `confirmedBy` пуст, пока ПТО норму не подтвердил.
    unconfirmedNorms: norms.filter((norm) => !norm.confirmedBy).length,
    lastImportAt,
    proposalPending: proposals.some((proposal) => proposal.status === "submitted"),
    baselines: baselines.length,
    openChanges: changes.filter((change) => change.status === "created" || change.status === "checked").length,
    filledPositions: contourRows.filter((row) => row.filled > 0).length,
    units,
    works
  };
}
async function mountDashboardPanel() {
  if (!root$2()) return;
  state$4.loading = true;
  state$4.error = "";
  render$2();
  try {
    const objects = listVisibleObjects();
    state$4.objectsSeen = objects.length;
    const digests = [];
    for (const object of objects.slice(0, OBJECT_LIMIT)) {
      digests.push(await digestOf(object));
    }
    state$4.digest = buildDashboard(digests);
    state$4.audit = (await listAudit(8)).map((record) => ({
      action: record.action,
      entity: record.entity,
      actor: record.actor,
      createdAt: record.createdAt,
      reason: record.reason
    }));
  } catch (error) {
    state$4.error = error instanceof Error ? error.message : String(error);
    state$4.digest = null;
  }
  state$4.loading = false;
  render$2();
}
const COLUMNS = [
  { key: "object", title: "Объект", value: (row) => row.objectName },
  { key: "positions", title: "Позиций", value: (row) => row.positions },
  { key: "plan", title: "План", value: (row) => row.plan },
  { key: "contract", title: "Договор", value: (row) => row.contract },
  { key: "proposed", title: "Предложено", value: (row) => row.proposed },
  { key: "approved", title: "Утверждено", value: (row) => row.approved },
  { key: "fact", title: "Факт", value: (row) => row.fact },
  { key: "percent", title: "Выполнение", value: (row) => row.factPercent },
  { key: "above", title: "Выше порога", value: (row) => row.aboveThreshold },
  { key: "decision", title: "Требует решения", value: (row) => row.needsDecision },
  { key: "norms", title: "Нормы без подтверждения", value: (row) => row.unconfirmedNorms },
  { key: "approval", title: "Утверждение", value: (row) => row.proposalPending ? "ждёт РП" : row.baselines ? `baseline ${row.baselines}` : "—" }
];
function digestTable() {
  const digest = state$4.digest;
  if (!digest) return "";
  const rows = sortRows(digest.objects, state$4.sort, (row, key) => {
    const column = COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : "";
  });
  if (rows.length === 0) return emptyObjectsHtml();
  const head = COLUMNS.map((column) => {
    const active = state$4.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml$4(column.key)}"
      class="${sortableHeaderClass(active, "py-1 pr-3 font-normal whitespace-nowrap")}">${escapeHtml$4(column.title)}</th>`;
  }).join("");
  const body = rows.map((row) => {
    const gap = planFactGap(row.plan, row.fact);
    return `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$4(row.objectName)}
          ${row.lastImportAt ? `<div class="text-rbi-caption text-muted">импорт: ${escapeHtml$4(row.lastImportAt.slice(0, 10))}</div>` : ""}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${row.positions}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml$4(showDecimal(row.plan))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$4(showDecimal(row.contract))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$4(showDecimal(row.proposed))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$4(showDecimal(row.approved))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml$4(showDecimal(row.fact))}
          ${gap === null ? "" : `<div class="text-rbi-caption ${String(gap).startsWith("-") ? "text-brand" : "text-muted"}">отставание ${escapeHtml$4(showDecimal(gap))}</div>`}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.factPercent === null ? "text-muted" : "text-ink"}">${escapeHtml$4(showPercent(row.factPercent))}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.aboveThreshold ? "text-danger" : "text-muted"}">${row.aboveThreshold === null ? "—" : row.aboveThreshold}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.needsDecision ? "text-danger" : "text-muted"}">${row.needsDecision}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.unconfirmedNorms ? "text-danger" : "text-muted"}">${row.unconfirmedNorms}</td>
        <td class="py-1 text-rbi-caption ${row.proposalPending ? "text-brand" : "text-muted"}">
          ${row.proposalPending ? "ждёт РП" : row.baselines ? `baseline ${row.baselines}` : "—"}</td>
      </tr>`;
  }).join("");
  const limited = state$4.objectsSeen > OBJECT_LIMIT ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые ${OBJECT_LIMIT} объектов из ${state$4.objectsSeen}.</div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Объекты</div>
      <table id="pf-dashboard-table" class="w-full min-w-[1100px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${limited}
    </div>`;
}
function bar(percent, options = { key: "" }) {
  const tone = options.tone === "danger" ? "bg-danger" : options.tone === "success" ? "bg-success" : "bg-brand";
  const height = options.height ?? "h-2";
  if (percent === null) {
    return `<div class="${height} w-full rounded-full border border-dashed border-surface bg-surface"></div>`;
  }
  return `<div class="${height} w-full bg-surface border border-surface rounded-full overflow-hidden">
    <div class="${height} ${tone} rounded-full transition-all" data-pf-bar="${escapeHtml$4(options.key)}"
      style="width:${Math.round(percent)}%"></div>
  </div>`;
}
function bigNumber(label, value, hint = "", tone = "text-ink") {
  return `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$4(label)}</div>
      <div class="text-2xl font-bold ${tone} leading-tight">${escapeHtml$4(value)}</div>
      ${hint ? `<div class="text-rbi-caption text-muted">${escapeHtml$4(hint)}</div>` : ""}
    </div>`;
}
function reconcileChart() {
  var _a, _b, _c;
  const incomplete = ((_a = state$4.digest) == null ? void 0 : _a.objects.reduce((sum, object) => sum + object.incomparable, 0)) ?? 0;
  const segments = reconcileSegments({
    warnings: ((_b = state$4.digest) == null ? void 0 : _b.totals.aboveThreshold) ?? 0,
    ok: ((_c = state$4.digest) == null ? void 0 : _c.objects.reduce((sum, object) => sum + Math.max(0, object.positions > 0 ? 1 : 0), 0)) ?? 0,
    incomplete
  });
  const tone = (value) => value === "danger" ? "bg-danger" : value === "brand" ? "bg-brand" : "bg-muted";
  return `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted mb-1">Сверка контуров: соотношение</div>
      <div class="flex w-full h-3 rounded-full overflow-hidden border border-surface" data-pf-segments>
        ${segments.map((segment) => segment.share > 0 ? `<div class="${tone(segment.tone)} h-3" data-pf-segment="${escapeHtml$4(segment.label)}"
              style="width:${segment.share}%" title="${escapeHtml$4(`${segment.label}: ${segment.value}`)}"></div>` : "").join("") || '<div class="bg-surface h-3 w-full"></div>'}
      </div>
      <div class="flex flex-wrap gap-3 mt-1">
        ${segments.map((segment) => `<span class="text-rbi-caption text-muted">
          <span class="inline-block w-2 h-2 rounded-full ${tone(segment.tone)} mr-1"></span>
          ${escapeHtml$4(segment.label)}: ${segment.value}</span>`).join("")}
      </div>
    </div>`;
}
function unitsChart() {
  var _a;
  const byUnit = ((_a = state$4.digest) == null ? void 0 : _a.byUnit) ?? [];
  if (byUnit.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объёмы по единицам измерения</div>
      <div class="text-rbi-caption text-muted">Данных нет: сначала разберите формы заказчика в разделе «ВОР».</div>
    </div>`;
  }
  const rows = byUnit.map((entry) => {
    const percent = barWidth(entry.fact.value, entry.plan.value);
    return `
      <li class="py-2 border-b border-surface">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body text-ink font-bold">${escapeHtml$4(entry.unit || "без единицы")}
            <span class="text-rbi-caption text-muted font-normal">· позиций ${entry.positions}</span></span>
          <span class="text-rbi-caption text-muted">
            план ${escapeHtml$4(showDecimal(entry.plan.value))} · факт ${escapeHtml$4(showDecimal(entry.fact.value))}
            · ${escapeHtml$4(showPercent(percent === null ? null : percent.toFixed(1)))}
            ${entry.plan.partial ? "· план неполный" : ""}${entry.fact.partial ? " · факт неполный" : ""}</span>
        </div>
        ${bar(percent, { key: `unit:${entry.unit}`, height: "h-3" })}
      </li>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объёмы по единицам измерения
        <span class="text-rbi-caption text-muted font-normal">· полоса — выполнение факта к плану</span></div>
      <ul class="list-none p-0 m-0">${rows}</ul>
    </div>`;
}
function worksChart() {
  var _a, _b, _c;
  const byUnit = ((_a = state$4.digest) == null ? void 0 : _a.byUnit) ?? [];
  if (byUnit.length === 0) return "";
  const byPlan = [...byUnit].sort((left, right) => Number((right.plan.value ?? "0").replace(",", ".")) - Number((left.plan.value ?? "0").replace(",", ".")));
  const unit = state$4.unit || (((_b = byPlan[0]) == null ? void 0 : _b.unit) ?? byUnit[0].unit);
  const works = (((_c = state$4.digest) == null ? void 0 : _c.topWorks) ?? []).filter((work) => work.unit === unit).slice(0, 8);
  if (works.length === 0) return "";
  const max = works.reduce((acc, work) => Math.max(acc, Number(work.plan ?? 0)), 0);
  const switcher = byUnit.map((entry) => `
    <button type="button" data-pf-unit="${escapeHtml$4(entry.unit)}"
      class="text-rbi-caption font-bold px-2 py-1 rounded-lg border ${entry.unit === unit ? "bg-brand text-white border-brand" : "text-muted border-surface"}">${escapeHtml$4(entry.unit || "без единицы")}</button>`).join("");
  const rows = works.map((work) => {
    const percent = barWidth(work.fact, work.plan);
    const share = max > 0 ? Math.round(Number(work.plan ?? 0) / max * 100) : 0;
    return `
      <li class="py-2 border-b border-surface">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body text-ink">${escapeHtml$4(work.workRaw)}</span>
          <span class="text-rbi-caption text-muted">план ${escapeHtml$4(showDecimal(work.plan))} ·
            факт ${escapeHtml$4(showDecimal(work.fact))} · ${escapeHtml$4(showPercent(percent === null ? null : percent.toFixed(1)))}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <!-- Верхняя полоса — объём работы (она видна всегда), нижняя — выполнение факта. -->
            <div class="h-3 w-full bg-surface border border-surface rounded-full overflow-hidden">
              <div class="h-3 bg-brand-soft rounded-full" data-pf-bar="workvolume:${escapeHtml$4(work.workRaw)}"
                style="width:${share}%"></div>
            </div>
            <div class="mt-1">${bar(percent, { key: `work:${work.workRaw}`, tone: percent !== null && percent < 50 ? "danger" : "brand" })}</div>
          </div>
          <span class="text-rbi-caption text-muted w-10 text-right" data-pf-share="${escapeHtml$4(work.workRaw)}">${share}%</span>
        </div>
      </li>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div class="text-rbi-body font-bold text-ink">Работы: объём и выполнение
          <span class="text-rbi-caption text-muted font-normal">· ${works.length} крупнейших</span></div>
        <div class="flex gap-1">${switcher}</div>
      </div>
      <ul class="list-none p-0 m-0">${rows}</ul>
      <div class="text-rbi-caption text-muted mt-2">Светлая полоса — объём работы в своей единице,
        тёмная под ней — выполнение факта к плану (если факт внесён). Справа — доля в объёме.</div>
    </div>`;
}
function emptyObjectsHtml() {
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объектов не видно</div>
      <div class="text-rbi-caption text-muted mb-2">Это про права роли, а не про отсутствие работ.
        Проверьте доступы в «Роли и права» — либо посмотрите модуль на демо-данных:
        они создаются только в этом браузере и никуда не отправляются.</div>
      <button type="button" id="pf-seed-demo" ${state$4.seeding ? "disabled" : ""}
        class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">
        ${state$4.seeding ? "Создаю демо-данные…" : "Загрузить демо-данные (объект + пробная ВОР)"}</button>
      ${state$4.note ? `<div class="text-rbi-caption text-brand mt-2">${escapeHtml$4(state$4.note)}</div>` : ""}
      ${state$4.error ? `<div class="text-rbi-body text-danger mt-2">${escapeHtml$4(state$4.error)}</div>` : ""}
    </div>`;
}
function objectCards() {
  const digest = state$4.digest;
  if (!digest) return "";
  if (digest.objects.length === 0) return emptyObjectsHtml();
  const cards = digest.objects.map((object) => {
    const percent = barWidth(object.fact, object.plan);
    const gap = planFactGap(object.plan, object.fact);
    const badges = [
      object.proposalPending ? '<span class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-0.5 rounded-lg">ждёт РП</span>' : "",
      object.baselines ? `<span class="text-rbi-caption text-muted border border-surface px-2 py-0.5 rounded-lg">baseline ${object.baselines}</span>` : "",
      object.openChanges ? `<span class="text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-0.5 rounded-lg">изменений ${object.openChanges}</span>` : "",
      object.aboveThreshold ? `<span class="text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-0.5 rounded-lg">сверка ${object.aboveThreshold}</span>` : "",
      object.needsDecision ? `<span class="text-rbi-caption text-danger border border-surface px-2 py-0.5 rounded-lg">решений ${object.needsDecision}</span>` : "",
      object.unconfirmedNorms ? `<span class="text-rbi-caption text-muted border border-surface px-2 py-0.5 rounded-lg">норм без подтверждения ${object.unconfirmedNorms}</span>` : ""
    ].filter(Boolean).join(" ");
    return `
      <li class="bg-surface border border-surface rounded-xl p-3 mb-2" data-pf-object="${escapeHtml$4(object.objectId)}">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body font-bold text-ink">${escapeHtml$4(object.objectName)}</span>
          <span class="text-rbi-caption text-muted">позиций ${object.positions}
            ${object.lastImportAt ? `· импорт ${escapeHtml$4(object.lastImportAt.slice(0, 10))}` : ""}</span>
        </div>
        <div class="mt-1">${bar(percent, { key: `object:${object.objectId}`, height: "h-3" })}</div>
        <div class="flex flex-wrap items-baseline justify-between gap-2 mt-1">
          <span class="text-rbi-caption text-muted">план ${escapeHtml$4(showDecimal(object.plan))} ·
            факт ${escapeHtml$4(showDecimal(object.fact))} ·
            выполнение ${escapeHtml$4(showPercent(object.factPercent))}</span>
          <span class="text-rbi-caption ${gap !== null && String(gap).startsWith("-") ? "text-brand" : "text-muted"}">
            ${gap === null ? "" : `отставание ${escapeHtml$4(showDecimal(gap))}`}</span>
        </div>
        ${badges ? `<div class="flex flex-wrap gap-1 mt-2">${badges}</div>` : ""}
        <div class="text-rbi-caption text-muted mt-1">контуры: договор ${escapeHtml$4(showDecimal(object.contract))} ·
          предложено ${escapeHtml$4(showDecimal(object.proposed))} · утверждено ${escapeHtml$4(showDecimal(object.approved))} ·
          принято ${escapeHtml$4(showDecimal(object.accepted))} · не заполнено позиций ${object.contoursIncomplete}</div>
      </li>`;
  }).join("");
  return `<ul class="list-none p-0 m-0 mb-3">${cards}</ul>`;
}
function viewToggle() {
  return `
    <div class="flex justify-end mb-2">
      <button type="button" id="pf-dashboard-view"
        class="text-rbi-caption font-bold text-muted border border-surface px-3 py-1 rounded-lg">
        ${state$4.showTable ? "Показать карточками" : "Показать таблицей"}</button>
    </div>`;
}
function render$2() {
  const container = root$2();
  if (!container) return;
  if (state$4.loading) {
    container.innerHTML = `<div class="text-rbi-caption text-muted">Собираю сводку…</div>`;
    return;
  }
  if (state$4.error) {
    container.innerHTML = `<div class="text-rbi-body text-danger">${escapeHtml$4(state$4.error)}</div>`;
    return;
  }
  const digest = state$4.digest;
  if (!digest) {
    container.innerHTML = `<div class="text-rbi-caption text-muted">Сводка пуста.</div>`;
    return;
  }
  const totals = digest.totals;
  digest.objects.reduce((sum, object) => sum + object.positions, 0);
  const audit = state$4.audit.map((record) => `
    <li class="text-rbi-caption text-muted">${escapeHtml$4(record.action)} · ${escapeHtml$4(record.entity)}
      · ${escapeHtml$4(record.actor || "—")} · ${escapeHtml$4(String(record.createdAt).slice(5, 16).replace("T", " "))}
      ${record.reason ? `· ${escapeHtml$4(record.reason)}` : ""}</li>`).join("");
  container.innerHTML = `
    ${state$4.note ? `<div class="text-rbi-caption text-brand mb-2">${escapeHtml$4(state$4.note)}</div>` : ""}
    ${state$4.error ? `<div class="text-rbi-body text-danger mb-2">${escapeHtml$4(state$4.error)}</div>` : ""}
    <div class="bg-surface border border-surface rounded-xl p-4 mb-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div class="text-rbi-caption text-muted">Выполнение по проекту (факт к плану)</div>
          <div class="text-4xl font-bold ${totals.factPercent === null ? "text-muted" : "text-ink"} leading-tight"
            data-pf-total-percent>${escapeHtml$4(showPercent(totals.factPercent))}</div>
          <div class="text-rbi-caption text-muted">${totals.factPercent === null ? "процента нет: без плана или без факта он не считается" : "считается из сумм плана и факта, а не как среднее по объектам"}</div>
        </div>
        <div class="text-right">
          <div class="text-rbi-caption text-muted">План</div>
          <div class="text-xl font-bold text-ink">${escapeHtml$4(showDecimal(totals.plan.value))}</div>
          <div class="text-rbi-caption text-muted">Факт</div>
          <div class="text-xl font-bold text-ink">${escapeHtml$4(showDecimal(totals.fact.value))}</div>
        </div>
      </div>
      <div class="mt-2">${bar(barWidth(totals.fact.value, totals.plan.value), { key: "project", height: "h-4" })}</div>
      <div class="text-rbi-caption text-muted mt-1">${totals.plan.partial ? `План неполный: не заполнено объектов — ${totals.plan.missing}.` : ""} ${totals.fact.partial ? `Факт неполный: не заполнено объектов — ${totals.fact.missing}.` : ""}</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${bigNumber("Объектов", String(totals.objects))}
      ${bigNumber("Позиций ВОР", String(totals.positions))}
      ${bigNumber(
    "Требует решения ПТО",
    String(totals.needsDecision),
    "работы без вида работ",
    totals.needsDecision ? "text-danger" : "text-ink"
  )}
      ${bigNumber("Ждут РП", `${totals.pendingProposals} / ${totals.openChanges}`, "предложений / изменений")}
    </div>
    <div class="mb-3">${reconcileChart()}</div>
    ${unitsChart()}
    ${worksChart()}
    ${viewToggle()}
    ${state$4.showTable ? digestTable() : objectCards()}
    ${digest.notes.length ? `<div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Что важно знать про эти числа</div>
      <ul class="list-none p-0 m-0">${digest.notes.map((note) => `<li class="text-rbi-caption text-muted">• ${escapeHtml$4(note)}</li>`).join("")}</ul>
    </div>` : ""}
    ${state$4.audit.length ? `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Последние действия (журнал)</div>
      <ul class="list-none p-0 m-0">${audit}</ul>
    </div>` : ""}
  `;
  bind$3();
}
async function runSeedDemo() {
  var _a;
  if (state$4.seeding) return;
  state$4.seeding = true;
  state$4.error = "";
  state$4.note = "";
  render$2();
  try {
    const result = await seedDemo();
    state$4.note = `Готово: «${result.objectName}», позиций ${result.positions}. Данные только в этом браузере — их можно удалить очисткой данных сайта.`;
  } catch (error) {
    state$4.error = error instanceof Error ? error.message : String(error);
  }
  state$4.seeding = false;
  const module = window.PlanFactModule;
  try {
    (_a = module == null ? void 0 : module.showTab) == null ? void 0 : _a.call(module);
  } catch (_error) {
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mountDashboardPanel();
  const note = state$4.note;
  state$4.note = note;
  render$2();
}
function bind$3() {
  var _a, _b;
  const container = root$2();
  if (!container) return;
  bindSortableTable(container.querySelector("#pf-dashboard-table"), state$4.sort, (next) => {
    state$4.sort = next;
    render$2();
  });
  (_a = container.querySelector("#pf-dashboard-view")) == null ? void 0 : _a.addEventListener("click", () => {
    state$4.showTable = !state$4.showTable;
    render$2();
  });
  (_b = container.querySelector("#pf-seed-demo")) == null ? void 0 : _b.addEventListener("click", () => {
    void runSeedDemo();
  });
  container.querySelectorAll("[data-pf-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      state$4.unit = button.getAttribute("data-pf-unit") ?? "";
      render$2();
    });
  });
}
function todayIso$1() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
const state$3 = {
  objectId: "",
  summarySort: { ...NO_SORT },
  worRows: [],
  facts: [],
  canRecord: false,
  workKey: "",
  floor: "",
  place: "",
  quantity: "",
  factDate: todayIso$1(),
  comment: "",
  correctingId: "",
  correctionValue: "",
  correctionReason: "",
  note: "",
  error: "",
  busy: false
};
function foremanRoot() {
  return document.getElementById("pf-foreman-root");
}
function planFactRoot() {
  return document.getElementById("pf-planfact-root");
}
function escapeHtml$3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function loadFactState(objectId) {
  var _a, _b;
  if (state$3.objectId !== objectId) {
    state$3.objectId = objectId;
    state$3.note = "";
    state$3.error = "";
    state$3.correctingId = "";
  }
  state$3.canRecord = canRecordFact();
  try {
    state$3.worRows = objectId ? await listWorRows(objectId) : [];
    state$3.facts = objectId ? await listFacts(objectId) : [];
    if (!state$3.workKey) state$3.workKey = ((_a = state$3.worRows[0]) == null ? void 0 : _a.workId) ?? "";
    if (!state$3.floor) state$3.floor = ((_b = state$3.worRows[0]) == null ? void 0 : _b.floor) ?? "";
  } catch (error) {
    state$3.error = error instanceof Error ? error.message : String(error);
    state$3.worRows = [];
    state$3.facts = [];
  }
}
async function mountForemanPanel(objectId) {
  await loadFactState(objectId);
  renderForeman();
}
async function mountPlanFactPanel(objectId) {
  await loadFactState(objectId);
  renderPlanFact$1();
}
function worksOf() {
  const map = /* @__PURE__ */ new Map();
  for (const row of state$3.worRows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    if (!map.has(key)) map.set(key, { workKey: row.workId ?? "", workRaw: row.workRaw, unit: row.unit || row.unitRaw || "" });
  }
  return [...map.values()].sort((left, right) => left.workRaw.localeCompare(right.workRaw, "ru"));
}
function floorsOf() {
  return [...new Set(state$3.worRows.map((row) => row.floor))].sort((left, right) => left.localeCompare(right, "ru"));
}
function selectedWork() {
  const works = worksOf();
  return works.find((work) => work.workKey === state$3.workKey) ?? works[0] ?? null;
}
function factRowHtml(record) {
  const superseded = record.supersededBy !== null;
  const correcting = state$3.correctingId === record.id;
  const marks = [
    superseded ? '<span class="text-danger">исправлен корректировкой</span>' : "",
    record.correctsId ? '<span class="text-muted">корректировка</span>' : "",
    record.status === "pending" ? '<span class="text-muted">в очереди</span>' : '<span class="text-muted">передан</span>'
  ].filter(Boolean).join(" · ");
  return `
    <li class="py-2 border-b border-surface">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-rbi-body text-ink">${escapeHtml$3(record.workRaw)} ·
            <span class="font-bold">${escapeHtml$3(formatDecimal(record.quantity))} ${escapeHtml$3(record.unit)}</span></div>
          <div class="text-rbi-caption text-muted">
            ${escapeHtml$3(record.floor)} этаж · ${escapeHtml$3(record.place || "—")} · ${escapeHtml$3(record.factDate)} ·
            ${escapeHtml$3(record.author)} · версия ${record.revision} · ${marks}
          </div>
          ${record.comment ? `<div class="text-rbi-caption text-muted">Комментарий: ${escapeHtml$3(record.comment)}</div>` : ""}
        </div>
        ${state$3.canRecord && !superseded ? `<button type="button" data-pf-correct="${escapeHtml$3(record.id)}"
               class="shrink-0 text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Корректировать</button>` : ""}
      </div>
      ${correcting ? `
        <div class="flex flex-wrap items-end gap-2 mt-2">
          <label class="flex flex-col gap-1">
            <span class="text-rbi-label text-muted">Новый объём</span>
            <input id="pf-correct-value" type="text" inputmode="decimal"
              class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1" />
          </label>
          <label class="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span class="text-rbi-label text-muted">Причина корректировки</span>
            <input id="pf-correct-reason" type="text"
              class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1" />
          </label>
          <button type="button" id="pf-correct-apply"
            class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Подтвердить</button>
          <button type="button" id="pf-correct-cancel"
            class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Отмена</button>
        </div>
        <div class="text-rbi-caption text-muted mt-1">Объём исходной записи не меняется: будет создана
          новая версия со ссылкой на неё.</div>` : ""}
    </li>`;
}
function entryFormHtml() {
  var _a;
  const works = worksOf();
  if (works.length === 0) {
    return `<div class="text-rbi-caption text-muted">В объекте нет сохранённой ВОР: сначала разберите форму
      заказчика в разделе «ВОР» — факт вносится по позициям плана.</div>`;
  }
  if (!state$3.canRecord) {
    return `<div class="text-rbi-caption text-muted">Факт вносит прораб (или инженер): у вашей роли права на
      ввод факта нет. Записи объекта видны ниже.</div>`;
  }
  const workOptions = works.map((work) => `<option value="${escapeHtml$3(work.workKey)}"${work.workKey === state$3.workKey ? " selected" : ""}>${escapeHtml$3(work.workRaw)}</option>`).join("");
  const floorOptions = floorsOf().map((floor) => `<option value="${escapeHtml$3(floor)}"${floor === state$3.floor ? " selected" : ""}>${escapeHtml$3(floor)}</option>`).join("");
  const unit = ((_a = selectedWork()) == null ? void 0 : _a.unit) ?? "";
  return `
    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Работа</span>
        <select id="pf-fact-work" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 max-w-[240px]">${workOptions}</select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Этаж</span>
        <select id="pf-fact-floor" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${floorOptions}</select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Помещение</span>
        <input id="pf-fact-place" type="text" value="${escapeHtml$3(state$3.place)}" placeholder="кв. 15а"
          class="w-28 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Объём${unit ? `, ${escapeHtml$3(unit)}` : ""}</span>
        <input id="pf-fact-qty" type="text" inputmode="decimal" value="${escapeHtml$3(state$3.quantity)}"
          class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Дата</span>
        <input id="pf-fact-date" type="date" value="${escapeHtml$3(state$3.factDate)}"
          class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1 flex-1 min-w-[160px]">
        <span class="text-rbi-label text-muted">Комментарий</span>
        <input id="pf-fact-comment" type="text" value="${escapeHtml$3(state$3.comment)}"
          class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <button type="button" id="pf-fact-add" ${state$3.busy ? "disabled" : ""}
        class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Внести факт</button>
    </div>`;
}
function renderForeman() {
  const container = foremanRoot();
  if (!container) return;
  const active = activeFacts(state$3.facts);
  const queue = state$3.facts.filter((record) => record.status === "pending").length;
  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Ввод факта выполнения</div>
      ${entryFormHtml()}
      <div class="text-rbi-caption text-muted mt-2">
        Объект: ${state$3.worRows.length} позиций ВОР, действующих записей факта: ${active.length},
        в очереди отправки: ${queue}.
        ${state$3.busy ? " · запись…" : ""}
      </div>
      ${state$3.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml$3(state$3.note)}</div>` : ""}
      ${state$3.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml$3(state$3.error)}</div>` : ""}
    </div>
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Внесённый факт (${state$3.facts.length})</div>
      ${state$3.facts.length === 0 ? '<div class="text-rbi-caption text-muted">Записей факта по этому объекту пока нет.</div>' : `<ul class="list-none p-0 m-0">${state$3.facts.map(factRowHtml).join("")}</ul>`}
      ${state$3.facts.length > 0 ? `<div class="text-rbi-caption text-muted mt-2">Факт не перезаписывается: исправление оформляется
           корректировкой, исходная запись остаётся в истории со своим объёмом. Отправка в облако —
           отдельный шаг, пока записи лежат в очереди на устройстве.</div>` : ""}
    </div>
  `;
  bindForeman();
}
function bindSummarySort() {
  const container = planFactRoot();
  if (!container) return;
  bindSortableTable(container.querySelector("#pf-planfact-table"), state$3.summarySort, (next) => {
    state$3.summarySort = next;
    renderPlanFact$1();
  });
}
function bindForeman() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const container = foremanRoot();
  if (!container) return;
  (_a = container.querySelector("#pf-fact-work")) == null ? void 0 : _a.addEventListener("change", (event) => {
    state$3.workKey = event.target.value;
    renderForeman();
  });
  (_b = container.querySelector("#pf-fact-floor")) == null ? void 0 : _b.addEventListener("change", (event) => {
    state$3.floor = event.target.value;
  });
  (_c = container.querySelector("#pf-fact-place")) == null ? void 0 : _c.addEventListener("input", (event) => {
    state$3.place = event.target.value;
  });
  (_d = container.querySelector("#pf-fact-qty")) == null ? void 0 : _d.addEventListener("input", (event) => {
    state$3.quantity = event.target.value;
  });
  (_e = container.querySelector("#pf-fact-date")) == null ? void 0 : _e.addEventListener("change", (event) => {
    state$3.factDate = event.target.value || todayIso$1();
  });
  (_f = container.querySelector("#pf-fact-comment")) == null ? void 0 : _f.addEventListener("input", (event) => {
    state$3.comment = event.target.value;
  });
  (_g = container.querySelector("#pf-fact-add")) == null ? void 0 : _g.addEventListener("click", () => {
    void runRecord();
  });
  container.querySelectorAll("[data-pf-correct]").forEach((button) => {
    button.addEventListener("click", () => {
      state$3.correctingId = button.getAttribute("data-pf-correct") ?? "";
      state$3.correctionValue = "";
      state$3.correctionReason = "";
      state$3.error = "";
      state$3.note = "";
      renderForeman();
    });
  });
  (_h = container.querySelector("#pf-correct-value")) == null ? void 0 : _h.addEventListener("input", (event) => {
    state$3.correctionValue = event.target.value;
  });
  (_i = container.querySelector("#pf-correct-reason")) == null ? void 0 : _i.addEventListener("input", (event) => {
    state$3.correctionReason = event.target.value;
  });
  (_j = container.querySelector("#pf-correct-apply")) == null ? void 0 : _j.addEventListener("click", () => {
    void runCorrection();
  });
  (_k = container.querySelector("#pf-correct-cancel")) == null ? void 0 : _k.addEventListener("click", () => {
    state$3.correctingId = "";
    renderForeman();
  });
}
async function runRecord() {
  var _a, _b;
  const work = selectedWork();
  if (!work) return;
  state$3.busy = true;
  state$3.error = "";
  state$3.note = "";
  renderForeman();
  try {
    const result = await recordFact({
      objectId: state$3.objectId,
      section: ((_a = state$3.worRows.find((row) => row.floor === state$3.floor)) == null ? void 0 : _a.section) ?? "",
      floor: state$3.floor,
      place: state$3.place.trim() || "по договору",
      workKey: work.workKey || null,
      workRaw: work.workRaw,
      unit: work.unit,
      quantity: state$3.quantity,
      factDate: state$3.factDate,
      comment: state$3.comment
    });
    if (!result.ok) {
      state$3.error = result.error ?? "Не удалось внести факт";
    } else {
      state$3.note = `Факт внесён: ${(_b = result.record) == null ? void 0 : _b.quantity} ${work.unit} — «${work.workRaw}».`;
      state$3.quantity = "";
      state$3.comment = "";
      state$3.facts = await listFacts(state$3.objectId);
    }
  } catch (error) {
    state$3.error = error instanceof Error ? error.message : String(error);
  }
  state$3.busy = false;
  renderForeman();
  renderPlanFact$1();
}
async function runCorrection() {
  var _a, _b;
  const originalId = state$3.correctingId;
  if (!originalId) return;
  state$3.busy = true;
  state$3.error = "";
  state$3.note = "";
  renderForeman();
  try {
    const result = await correctFact(originalId, {
      quantity: state$3.correctionValue,
      comment: state$3.correctionReason
    });
    if (!result.ok) {
      state$3.error = result.error ?? "Не удалось оформить корректировку";
    } else {
      state$3.note = `Корректировка внесена: ${(_a = result.record) == null ? void 0 : _a.quantity} (версия ${(_b = result.record) == null ? void 0 : _b.revision}). Исходная запись сохранена.`;
      state$3.correctingId = "";
      state$3.correctionValue = "";
      state$3.correctionReason = "";
      state$3.facts = await listFacts(state$3.objectId);
    }
  } catch (error) {
    state$3.error = error instanceof Error ? error.message : String(error);
  }
  state$3.busy = false;
  renderForeman();
  renderPlanFact$1();
}
const SUMMARY_COLUMNS = [
  { key: "floor", title: "Этаж", value: (row) => row.floor },
  { key: "work", title: "Работа", value: (row) => row.workRaw },
  { key: "unit", title: "ЕИ", value: (row) => row.unit },
  { key: "plan", title: "План", value: (row) => row.plan },
  { key: "fact", title: "Факт", value: (row) => row.fact },
  { key: "deviation", title: "Отклонение", value: (row) => row.deviation },
  { key: "percent", title: "Выполнено", value: (row) => row.percent }
];
function summaryValue(row, key) {
  const column = SUMMARY_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : "";
}
function renderPlanFact$1() {
  const container = planFactRoot();
  if (!container) return;
  const worRows = state$3.worRows.map((row) => ({
    section: row.section,
    floor: row.floor,
    place: row.place,
    workRaw: row.workRaw,
    workId: row.workId,
    workMatch: row.workMatch === "manual" ? "manual" : row.workMatch === "auto" ? "auto" : "unresolved",
    matchReason: row.matchReason,
    unitRaw: row.unitRaw,
    unit: null,
    quantity: row.quantity,
    fragment: { sheet: row.sheet, row: row.rowNumber, column: row.column, rawValue: null }
  }));
  const summary = buildPlanFactSummary(worRows, state$3.facts, { floorOrder: floorsOf() });
  const card = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$3(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$3(value)}</div>
    </div>`;
  const rows = sortRows(summary.rows, state$3.summarySort, summaryValue).map((row) => {
    const behind = row.deviation.startsWith("-") === false && row.deviation !== "0";
    return `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$3(row.floor)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml$3(row.workRaw)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml$3(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink text-right">${formatDecimal(row.plan)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink text-right">${formatDecimal(row.fact)}</td>
        <td class="py-1 pr-3 text-rbi-body text-right ${behind ? "text-danger" : "text-ink"}">${formatDecimal(row.deviation)}</td>
        <td class="py-1 text-rbi-caption text-muted text-right">${row.percent === null ? "—" : `${escapeHtml$3(row.percent)}%`}</td>
      </tr>`;
  }).join("");
  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card("Позиций в своде", String(summary.rows.length))}
      ${card("План", formatDecimal(summary.totalPlan))}
      ${card("Факт", formatDecimal(summary.totalFact))}
      ${card(
    "Отклонение",
    formatDecimal(summary.totalDeviation),
    summary.totalDeviation !== "0" && !summary.totalDeviation.startsWith("-") ? "text-danger" : "text-ink"
  )}
      ${card("Выполнение", summary.totalPercent === null ? "—" : `${summary.totalPercent}%`)}
      ${card("Записей факта", String(state$3.facts.length))}
      ${card("В очереди отправки", String(summary.factsInQueue))}
      ${card("Исправлено сторно", String(summary.corrected))}
    </div>
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">План-факт по этажам и видам работ</div>
      ${summary.rows.length === 0 ? '<div class="text-rbi-caption text-muted">Нет ни плана, ни факта по этому объекту.</div>' : `<table id="pf-planfact-table" class="w-full min-w-[720px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              ${SUMMARY_COLUMNS.map((column) => {
    const active = state$3.summarySort.key === column.key;
    const align = ["plan", "fact", "deviation", "percent"].includes(column.key) ? "text-right" : "";
    return `<th data-sort-key="${escapeHtml$3(column.key)}"
                  class="${sortableHeaderClass(active, `py-1 pr-3 font-normal ${align}`)}">${escapeHtml$3(column.title)}</th>`;
  }).join("")}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
      <div class="text-rbi-caption text-muted mt-2">
        План — из сохранённой ВОР объекта, факт — из действующих записей (исправленные сторно не считаются).
        Облачная отправка факта появится отдельным шагом: сейчас записи ждут на устройстве.
        Сортировка — нажатием на заголовок колонки.
      </div>
    </div>
  `;
  bindSummarySort();
}
const DECIMAL_SCALE = 3;
function compareFloors(left, right) {
  const leftNumber = Number(left.replace(",", "."));
  const rightNumber = Number(right.replace(",", "."));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, "ru");
}
function buildSchedule(input) {
  const { items, norms } = input;
  const excluded = [];
  const usable = [];
  for (const item of items) {
    const norm = item.workKey ? norms[item.workKey] : void 0;
    if (!item.workKey || !norm) {
      excluded.push({ reason: "unresolved-work", rawWork: item.rawWork ?? "", unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    if (norm.unit !== item.unit) {
      excluded.push({ reason: "unit-mismatch", rawWork: item.rawWork ?? norm.name, unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    if (compareDecimal(norm.norm, "0") <= 0) {
      excluded.push({ reason: "no-norm", rawWork: item.rawWork ?? norm.name, unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    usable.push(item);
  }
  const byFloor = /* @__PURE__ */ new Map();
  for (const item of usable) {
    const floor = String(item.floor);
    const floorMap = byFloor.get(floor) ?? /* @__PURE__ */ new Map();
    const key = item.workKey;
    floorMap.set(key, addDecimal(floorMap.get(key) ?? "0", item.qty));
    byFloor.set(floor, floorMap);
  }
  const floors = [...byFloor.keys()].sort(compareFloors);
  const laneCount = Math.max(1, Math.floor(input.parallelFloors) || 1);
  const lanes = new Array(laneCount).fill("0");
  const rows = [];
  for (const floor of floors) {
    let lane = 0;
    for (let index2 = 1; index2 < lanes.length; index2 += 1) {
      if (compareDecimal(lanes[index2], lanes[lane]) < 0) lane = index2;
    }
    let cursor = lanes[lane];
    const works = [...byFloor.get(floor).entries()].map(([key, qty]) => ({ ...norms[key], qty })).sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, "ru"));
    for (const work of works) {
      const manDays = divideDecimal(work.qty, work.norm, DECIMAL_SCALE);
      const duration = work.crew > 0 ? divideDecimal(manDays, String(work.crew), DECIMAL_SCALE) : manDays;
      const start = cursor;
      const end = addDecimal(start, duration);
      rows.push({
        floor,
        key: work.key,
        name: work.name,
        unit: work.unit,
        qty: work.qty,
        norm: work.norm,
        crew: work.crew,
        lag: work.lag,
        confirmed: work.confirmed,
        manDays,
        duration,
        start,
        end
      });
      cursor = addDecimal(end, work.lag);
    }
    lanes[lane] = cursor;
  }
  const totalManDays = sumDecimal(rows.map((row) => row.manDays));
  const totalDays = rows.length > 0 ? maxDecimal(rows.map((row) => row.end)) : "0";
  const loadDays = Math.floor(Number(ceilDecimal(totalDays))) + 1;
  const load = new Array(Math.max(1, loadDays)).fill(0);
  for (const row of rows) {
    const from = Math.floor(Number(floorDecimal(row.start)));
    const to = Math.floor(Number(ceilDecimal(row.end)));
    for (let day = from; day < to; day += 1) {
      if (day >= 0 && day < load.length) load[day] += row.crew;
    }
  }
  return {
    rows,
    floors,
    totalManDays,
    totalDays,
    load,
    excluded,
    warnings: buildWarnings(rows, excluded, usable)
  };
}
function buildWarnings(rows, excluded, usable) {
  const warnings = [];
  const unresolved = excluded.filter((entry) => entry.reason === "unresolved-work");
  if (unresolved.length) {
    const kinds = [...new Set(unresolved.map((entry) => entry.rawWork))];
    warnings.push(
      `Не сопоставлено со справочником: ${unresolved.length} строк (${kinds.length} видов работ). В график не попали: ${kinds.slice(0, 4).map((kind) => `«${kind}»`).join(", ")}${kinds.length > 4 ? " и другие" : ""}.`
    );
  }
  const mismatch = excluded.filter((entry) => entry.reason === "unit-mismatch");
  if (mismatch.length) {
    warnings.push(`Единица измерения в форме не совпадает со справочником: ${mismatch.length} строк. Из расчёта исключены.`);
  }
  const noNorm = excluded.filter((entry) => entry.reason === "no-norm");
  if (noNorm.length) warnings.push(`Нет нормы выработки: ${noNorm.length} строк.`);
  const unconfirmed = [...new Set(rows.filter((row) => !row.confirmed).map((row) => row.name))];
  if (unconfirmed.length) {
    warnings.push(
      `Норма не подтверждена ПТО (агрегатная норма заказчика): ${unconfirmed.join(", ")}. Сроки по этим работам — ориентировочные.`
    );
  }
  if (!usable.length) warnings.push("Нет ни одной позиции, пригодной для расчёта графика.");
  return warnings;
}
function addWorkDays(start, days, workWeek, nonWorkingDays = []) {
  const date = new Date(start.getTime());
  let left = Math.max(0, Math.round(days));
  const holidays = new Set(nonWorkingDays);
  let guard = 0;
  while (left > 0 && guard < 1e4) {
    date.setDate(date.getDate() + 1);
    guard += 1;
    const day = date.getDay();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const isDayOff = day === 0 || workWeek <= 5 && day === 6 || holidays.has(iso);
    if (!isDayOff) left -= 1;
  }
  return date;
}
function finishDate(startDate, totalDays, workWeek, nonWorkingDays = []) {
  const start = /* @__PURE__ */ new Date(`${startDate}T00:00:00`);
  return addWorkDays(start, Number(ceilDecimal(totalDays)), workWeek, nonWorkingDays);
}
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}
function todayIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
const state$2 = {
  objectId: "",
  ganttSort: { ...NO_SORT },
  normsSort: { ...NO_SORT },
  normDrafts: {},
  startDate: todayIso(),
  workWeek: 5,
  nonWorkingDays: [],
  parallelFloors: 1,
  norms: [],
  canEditNorms: false,
  result: null,
  sourceRows: 0,
  note: "",
  error: "",
  busy: false,
  showNorms: false
};
function root$1() {
  return document.getElementById("pf-schedule-root");
}
function escapeHtml$2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function mountSchedulePanel(objectId) {
  const container = root$1();
  if (!container) return;
  if (state$2.objectId !== objectId) {
    state$2.objectId = objectId;
    state$2.result = null;
    state$2.note = "";
    state$2.error = "";
  }
  try {
    state$2.canEditNorms = canManageNorms();
    state$2.norms = await listNorms();
    const calendar = await loadCalendar();
    state$2.workWeek = calendar.workWeek;
    state$2.nonWorkingDays = calendar.nonWorkingDays;
    const rows = state$2.objectId ? await listWorRows(state$2.objectId) : [];
    state$2.sourceRows = rows.length;
  } catch (error) {
    state$2.error = error instanceof Error ? error.message : String(error);
    state$2.sourceRows = 0;
  }
  render$1();
}
function confirmedNormCount() {
  return state$2.norms.filter((norm) => norm.source === "pto").length;
}
function statsHtml$1() {
  const result = state$2.result;
  if (!result) return "";
  const finish = finishDate(state$2.startDate, result.totalDays, state$2.workWeek, state$2.nonWorkingDays);
  const card = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$2(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$2(value)}</div>
    </div>`;
  const unconfirmedRows = result.rows.filter((row) => !row.confirmed).length;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card("Строк в графике", String(result.rows.length))}
      ${card("Человеко-дней", formatDecimal(result.totalManDays, 2))}
      ${card("Длительность, дней", formatDecimal(result.totalDays, 2))}
      ${card("Окончание", formatDate(finish))}
      ${card("Этажей", String(result.floors.length))}
      ${card("Нерабочих дат учтено", String(state$2.nonWorkingDays.length))}
      ${card("Исключено из расчёта", String(result.excluded.length), result.excluded.length > 0 ? "text-danger" : "text-ink")}
      ${card(
    "Нормы задал ПТО",
    `${confirmedNormCount()} из ${state$2.norms.length}`,
    confirmedNormCount() === 0 ? "text-danger" : "text-ink"
  )}
      ${unconfirmedRows > 0 ? `<div class="col-span-2 sm:col-span-4 text-rbi-caption text-danger">В графике ${unconfirmedRows} строк
           по нормам, которые ПТО не подтверждал: сроки по ним ориентировочные.</div>` : ""}
    </div>`;
}
function warningsHtml() {
  var _a;
  const warnings = ((_a = state$2.result) == null ? void 0 : _a.warnings) ?? [];
  if (warnings.length === 0) return "";
  const items = warnings.map((warning) => `<li class="text-rbi-caption text-muted">${escapeHtml$2(warning)}</li>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Что важно знать про этот график</div>
      <ul class="space-y-0.5">${items}</ul>
    </div>`;
}
function barHtml(row, total) {
  const left = total > 0 ? decimalToNumber(row.start) / total * 100 : 0;
  const width = total > 0 ? Math.max(1.5, decimalToNumber(row.duration) / total * 100) : 100;
  const tone = row.confirmed ? "bg-brand" : "bg-warning";
  const title = `${row.name}: ${formatDecimal(row.qty)} ${row.unit} · ${formatDecimal(row.manDays, 2)} чел-дн · бригада ${row.crew} · ${formatDecimal(row.duration, 2)} дн` + (row.confirmed ? "" : " · норму не подтверждал ПТО");
  return `<div class="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${tone}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${escapeHtml$2(title)}"></div>`;
}
const GANTT_COLUMNS = [
  { key: "work", title: "Работа", value: (row) => row.name },
  { key: "qty", title: "Объём", value: (row) => row.qty },
  { key: "duration", title: "Длительность", value: (row) => row.duration },
  { key: "start", title: "Начало", value: (row) => row.start }
];
function ganttValue(row, key) {
  const column = GANTT_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : "";
}
function ganttHtml() {
  const result = state$2.result;
  if (!result || result.rows.length === 0) return "";
  const total = decimalToNumber(result.totalDays);
  const ganttHead = `<tr class="text-rbi-caption text-muted text-left">
      ${GANTT_COLUMNS.map((column) => {
    const active = state$2.ganttSort.key === column.key;
    return `<th data-sort-key="${escapeHtml$2(column.key)}"
          class="${sortableHeaderClass(active, "py-1 pr-3 font-normal")}">${escapeHtml$2(column.title)}</th>`;
  }).join("")}
      <th class="py-1 w-full font-normal">Диаграмма</th>
      <th class="py-1 pl-3 font-normal">Дни</th>
    </tr>`;
  const floors = result.floors.map((floor) => {
    const rows = sortRows(result.rows.filter((row) => row.floor === floor), state$2.ganttSort, ganttValue);
    const body = rows.map((row) => `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml$2(row.name)}${row.confirmed ? "" : " ·"}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.qty)} ${escapeHtml$2(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.duration, 2)} дн</td>
        <td class="py-1 w-full">
          <div class="relative h-4 bg-brand-soft rounded-full">${barHtml(row, total)}</div>
        </td>
        <td class="py-1 pl-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.start, 1)}–${formatDecimal(row.end, 1)}</td>
      </tr>`).join("");
    return `
      <div class="mb-3">
        <div class="text-rbi-body font-bold text-ink mb-1">Этаж ${escapeHtml$2(floor)}</div>
        <table class="w-full" data-pf-gantt-table="${escapeHtml$2(floor)}">
          <thead>${ganttHead}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="text-rbi-body font-bold text-ink">Диаграмма работ</div>
        <div class="text-rbi-caption text-muted">старт ${escapeHtml$2(state$2.startDate.split("-").reverse().join("."))} ·
          всего ${formatDecimal(result.totalDays, 2)} дн · шкала в днях от старта</div>
      </div>
      ${floors}
    </div>`;
}
function loadHtml() {
  const result = state$2.result;
  if (!result || result.load.length === 0) return "";
  const peak = Math.max(...result.load, 1);
  const bars = result.load.slice(0, 120).map((people, day) => {
    const height = Math.round(people / peak * 100);
    return `<div class="flex-1 min-w-[3px]" title="день ${day}: ${people} чел.">
      <div class="bg-brand rounded-sm" style="height:${Math.max(people > 0 ? 6 : 2, height)}%;opacity:${people > 0 ? 1 : 0.2}"></div>
    </div>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Загрузка людей по дням (максимум ${peak} чел.)</div>
      <div class="flex items-end gap-[2px] h-16">${bars}</div>
      <div class="text-rbi-caption text-muted mt-1">Перегруз здесь виден, но расчёт его не блокирует —
        решение за тем, кто ведёт график.</div>
    </div>`;
}
function excludedHtml() {
  var _a;
  const excluded = ((_a = state$2.result) == null ? void 0 : _a.excluded) ?? [];
  if (excluded.length === 0) return "";
  const reasonText = {
    "unresolved-work": "вид работ не сопоставлен",
    "unit-mismatch": "единица не совпала со справочником",
    "no-norm": "нет нормы выработки"
  };
  const rows = excluded.slice(0, 12).map((entry) => `
    <li class="text-rbi-caption text-muted">${escapeHtml$2(entry.rawWork || "—")} ·
      ${formatDecimal(entry.qty)} ${escapeHtml$2(entry.unit || "")} · ${escapeHtml$2(reasonText[entry.reason])}</li>`).join("");
  const more = excluded.length > 12 ? `<li class="text-rbi-caption text-muted">…и ещё ${excluded.length - 12}</li>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Не попало в график: ${excluded.length}</div>
      <ul class="space-y-0.5">${rows}${more}</ul>
    </div>`;
}
const NORM_COLUMNS = [
  { key: "work", title: "Вид работ", value: (row) => row.name },
  { key: "norm", title: "Выработка", value: (row) => row.norm },
  { key: "crew", title: "Бригада", value: (row) => row.crew },
  { key: "lag", title: "Пауза", value: (row) => row.lag },
  { key: "source", title: "Источник", value: (row) => row.source === "pto" ? "задал ПТО" : "норма заказчика" }
];
function normsValue(row, key) {
  const column = NORM_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : "";
}
function draftValue(key, field2, fallback) {
  const draft = state$2.normDrafts[key];
  const value = draft ? draft[field2] : void 0;
  return value === void 0 ? fallback : value;
}
function normsHtml() {
  if (!state$2.showNorms) return "";
  const rows = sortRows(state$2.norms, state$2.normsSort, normsValue).map((norm) => {
    const source = norm.source === "pto" ? `задал ПТО${norm.confirmedBy ? ` · ${escapeHtml$2(norm.confirmedBy)}` : ""}${norm.confirmedAt ? ` · ${escapeHtml$2(norm.confirmedAt.slice(0, 10))}` : ""}` : "норма заказчика — ПТО не подтверждал";
    if (!state$2.canEditNorms) {
      return `
        <tr class="border-b border-surface">
          <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml$2(norm.name)}</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${formatDecimal(norm.norm)} ${escapeHtml$2(norm.unit)}/чел·дн</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${norm.crew} чел.</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${formatDecimal(norm.lag)} сут</td>
          <td class="py-1 text-rbi-caption ${norm.source === "pto" ? "text-muted" : "text-danger"}">${source}</td>
        </tr>`;
    }
    const key = escapeHtml$2(norm.workKey);
    return `
      <tr class="border-b border-surface" data-pf-norm-row="${key}">
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml$2(norm.name)}</td>
        <td class="py-1 pr-3 whitespace-nowrap">
          <input id="pf-norm-${key}" type="text" inputmode="decimal" value="${escapeHtml$2(draftValue(norm.workKey, "norm", norm.norm))}"
            class="w-20 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
          <span class="text-rbi-caption text-muted">${escapeHtml$2(norm.unit)}/чел·дн</span>
        </td>
        <td class="py-1 pr-3">
          <input id="pf-crew-${key}" type="number" min="1" step="1" value="${escapeHtml$2(draftValue(norm.workKey, "crew", String(norm.crew)))}"
            class="w-16 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
        </td>
        <td class="py-1 pr-3">
          <input id="pf-lag-${key}" type="text" inputmode="decimal" value="${escapeHtml$2(draftValue(norm.workKey, "lag", norm.lag))}"
            class="w-16 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
        </td>
        <td class="py-1 pr-3 text-rbi-caption ${norm.source === "pto" ? "text-muted" : "text-danger"}">${source}</td>
        <td class="py-1 whitespace-nowrap">
          <button type="button" data-pf-norm-save="${key}"
            class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Сохранить</button>
          <button type="button" data-pf-norm-reset="${key}"
            class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Сбросить</button>
        </td>
      </tr>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-1">Нормы выработки: ПТО задал ${confirmedNormCount()} из ${state$2.norms.length}</div>
      <div class="text-rbi-caption text-muted mb-2">
        ${state$2.canEditNorms ? "Право ПТО есть у вашей роли: правьте выработку, состав бригады и паузу — норма сохраняется в реестр компании." : "Норму задаёт ПТО. У вашей роли права на правку нет, поэтому таблица только для чтения."}
        Базовое наполнение — агрегатные нормы заказчика из формы «График.xlsx».
      </div>
      <table id="pf-norms-table" class="w-full min-w-[720px]">
        <thead><tr class="text-rbi-caption text-muted text-left">
          ${NORM_COLUMNS.map((column) => {
    const active = state$2.normsSort.key === column.key;
    return `<th data-sort-key="${escapeHtml$2(column.key)}"
              class="${sortableHeaderClass(active, "py-1 pr-3 font-normal")}">${escapeHtml$2(column.title)}</th>`;
  }).join("")}
          <th class="py-1 font-normal"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function calendarHtml() {
  const weekOptions = [5, 6, 7].map((week) => `<option value="${week}"${week === state$2.workWeek ? " selected" : ""}>${week} дней</option>`).join("");
  const days = state$2.nonWorkingDays.map((day) => `
    <li class="inline-flex items-center gap-1 bg-surface border border-surface rounded-lg px-2 py-1 mr-1 mb-1">
      <span class="text-rbi-caption text-ink">${escapeHtml$2(day)}</span>
      <button type="button" data-pf-day-remove="${escapeHtml$2(day)}"
        class="text-rbi-caption text-danger font-bold" title="Убрать нерабочий день">×</button>
    </li>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Рабочий календарь</div>
      <div class="flex flex-wrap items-end gap-2 mb-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Рабочая неделя</span>
          <select id="pf-work-week" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${weekOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Нерабочий день</span>
          <input id="pf-day-input" type="date"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-day-add"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Добавить</button>
      </div>
      ${state$2.nonWorkingDays.length ? `<ul class="list-none p-0 m-0">${days}</ul>
           <div class="text-rbi-caption text-muted">Нерабочие даты сдвигают календарную дату окончания;
             длительность в рабочих днях не меняется.</div>` : '<div class="text-rbi-caption text-muted">Нерабочих дат нет: учитываются только выходные выбранной недели.</div>'}
    </div>`;
}
function render$1() {
  const container = root$1();
  if (!container) return;
  const hasWor = state$2.sourceRows > 0;
  const canBuild = hasWor && !state$2.busy;
  const floorOptions = [1, 2, 3, 4].map((count) => `<option value="${count}"${count === state$2.parallelFloors ? " selected" : ""}>${count}</option>`).join("");
  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Параметры графика</div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Начало работ</span>
          <input id="pf-start-date" type="date" value="${escapeHtml$2(state$2.startDate)}"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Параллельных этажей</span>
          <select id="pf-parallel" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${floorOptions}</select>
        </label>
        <button type="button" id="pf-build" ${canBuild ? "" : "disabled"}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Построить график</button>
        <button type="button" id="pf-norms-toggle"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">
          ${state$2.showNorms ? "Скрыть нормы" : "Показать нормы"}</button>
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        ${hasWor ? `Источник — сохранённая ВОР объекта: ${state$2.sourceRows} позиций. График строится только по сопоставленным работам, у которых есть норма.` : "В этом объекте нет сохранённой ВОР: сначала разберите форму заказчика в разделе «ВОР»."}
        ${state$2.busy ? " · идёт расчёт…" : ""}
      </div>
      ${state$2.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml$2(state$2.note)}</div>` : ""}
      ${state$2.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml$2(state$2.error)}</div>` : ""}
    </div>
    ${calendarHtml()}
    ${statsHtml$1()}
    ${warningsHtml()}
    ${ganttHtml()}
    ${loadHtml()}
    ${excludedHtml()}
    ${normsHtml()}
  `;
  bind$2();
}
function bind$2() {
  var _a, _b, _c, _d, _e, _f;
  const container = root$1();
  if (!container) return;
  container.querySelectorAll("[data-pf-gantt-table]").forEach((table) => {
    bindSortableTable(table, state$2.ganttSort, (next) => {
      state$2.ganttSort = next;
      render$1();
    });
  });
  bindSortableTable(container.querySelector("#pf-norms-table"), state$2.normsSort, (next) => {
    state$2.normsSort = next;
    render$1();
  });
  for (const field2 of ["norm", "crew", "lag"]) {
    container.querySelectorAll(`[id^="pf-${field2}-"]`).forEach((input) => {
      input.addEventListener("input", () => {
        const workKey = (input.id || "").replace(`pf-${field2}-`, "");
        if (!workKey) return;
        state$2.normDrafts[workKey] = { ...state$2.normDrafts[workKey] || {}, [field2]: input.value };
      });
    });
  }
  (_a = container.querySelector("#pf-start-date")) == null ? void 0 : _a.addEventListener("change", (event) => {
    state$2.startDate = event.target.value || todayIso();
    state$2.result = null;
    state$2.note = "";
    render$1();
  });
  (_b = container.querySelector("#pf-work-week")) == null ? void 0 : _b.addEventListener("change", (event) => {
    void runCalendarSave({ workWeek: Number(event.target.value) || 5 });
  });
  (_c = container.querySelector("#pf-parallel")) == null ? void 0 : _c.addEventListener("change", (event) => {
    state$2.parallelFloors = Number(event.target.value) || 1;
    state$2.result = null;
    render$1();
  });
  (_d = container.querySelector("#pf-day-add")) == null ? void 0 : _d.addEventListener("click", () => {
    const input = container.querySelector("#pf-day-input");
    const value = (input == null ? void 0 : input.value) ?? "";
    if (!value) return;
    void runCalendarSave({ nonWorkingDays: [...state$2.nonWorkingDays, value] });
  });
  container.querySelectorAll("[data-pf-day-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const day = button.getAttribute("data-pf-day-remove") ?? "";
      void runCalendarSave({ nonWorkingDays: state$2.nonWorkingDays.filter((item) => item !== day) });
    });
  });
  (_e = container.querySelector("#pf-build")) == null ? void 0 : _e.addEventListener("click", () => {
    void runBuild();
  });
  (_f = container.querySelector("#pf-norms-toggle")) == null ? void 0 : _f.addEventListener("click", () => {
    state$2.showNorms = !state$2.showNorms;
    render$1();
  });
  container.querySelectorAll("[data-pf-norm-save]").forEach((button) => {
    button.addEventListener("click", () => {
      void runNormSave(button.getAttribute("data-pf-norm-save") ?? "");
    });
  });
  container.querySelectorAll("[data-pf-norm-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      void runNormReset(button.getAttribute("data-pf-norm-reset") ?? "");
    });
  });
}
async function runCalendarSave(patch) {
  state$2.error = "";
  try {
    const saved = await saveCalendar(
      patch.workWeek ?? state$2.workWeek,
      normalizeNonWorkingDays(patch.nonWorkingDays ?? state$2.nonWorkingDays)
    );
    state$2.workWeek = saved.workWeek;
    state$2.nonWorkingDays = saved.nonWorkingDays;
    state$2.note = `Календарь сохранён: ${saved.workWeek} дней в неделю, нерабочих дат — ${saved.nonWorkingDays.length}.`;
  } catch (error) {
    state$2.error = error instanceof Error ? error.message : String(error);
  }
  render$1();
}
async function runNormSave(workKey) {
  var _a, _b, _c, _d, _e;
  const container = root$1();
  state$2.error = "";
  state$2.note = "";
  try {
    const selector = (id) => `[id="${id}"]`;
    const norm = ((_a = container == null ? void 0 : container.querySelector(selector(`pf-norm-${workKey}`))) == null ? void 0 : _a.value) ?? "";
    const crew = ((_b = container == null ? void 0 : container.querySelector(selector(`pf-crew-${workKey}`))) == null ? void 0 : _b.value) ?? "";
    const lag = ((_c = container == null ? void 0 : container.querySelector(selector(`pf-lag-${workKey}`))) == null ? void 0 : _c.value) ?? "";
    const result = await saveNorm({ workKey, norm, crew, lag });
    if (!result.ok) {
      state$2.error = result.error ?? "Не удалось сохранить норму";
    } else {
      state$2.note = `Норма «${((_d = result.record) == null ? void 0 : _d.name) ?? workKey}» сохранена: ${(_e = result.record) == null ? void 0 : _e.norm} на человека в день.`;
      delete state$2.normDrafts[workKey];
      state$2.norms = await listNorms();
      state$2.result = null;
    }
  } catch (error) {
    state$2.error = error instanceof Error ? error.message : String(error);
  }
  render$1();
}
async function runNormReset(workKey) {
  state$2.error = "";
  state$2.note = "";
  try {
    const result = await resetNorm(workKey);
    if (!result.ok) {
      state$2.error = result.error ?? "Не удалось сбросить норму";
    } else {
      state$2.note = "Норма возвращена к черновику из формы заказчика.";
      delete state$2.normDrafts[workKey];
      state$2.norms = await listNorms();
      state$2.result = null;
    }
  } catch (error) {
    state$2.error = error instanceof Error ? error.message : String(error);
  }
  render$1();
}
async function runBuild() {
  if (!state$2.objectId) return;
  state$2.busy = true;
  state$2.error = "";
  state$2.note = "";
  render$1();
  try {
    const stored = await listWorRows(state$2.objectId);
    const items = stored.map((row) => ({
      section: row.section,
      floor: row.floor,
      place: row.place,
      workKey: row.workId,
      rawWork: row.workRaw,
      // Нормы заданы в канонической единице: сырое написание из формы («S, м2») не годится.
      unit: row.unit || row.unitRaw || "",
      qty: row.quantity
    }));
    const result = buildSchedule({
      items,
      norms: await normsForSchedule(),
      startDate: state$2.startDate,
      workWeek: state$2.workWeek,
      parallelFloors: state$2.parallelFloors,
      nonWorkingDays: state$2.nonWorkingDays
    });
    state$2.result = result;
    state$2.note = `В графике ${result.rows.length} строк по ${result.floors.length} этажам.`;
  } catch (error) {
    state$2.error = error instanceof Error ? error.message : String(error);
    state$2.result = null;
  }
  state$2.busy = false;
  render$1();
}
function decodeCsv(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-8" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch (_error) {
    return { text: new TextDecoder("windows-1251").decode(bytes), encoding: "windows-1251" };
  }
}
function detectDelimiter(text2) {
  const candidates = [";", ",", "	"];
  const lines = text2.split(/\r?\n/).filter((line) => line.trim() !== "").slice(0, 10);
  if (lines.length === 0) return ";";
  let best = ";";
  let bestScore = -1;
  for (const candidate of candidates) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate));
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    const positive = counts.filter((value) => value > 0);
    const average = total / positive.length;
    const even = positive.filter((value) => value === positive[0]).length;
    const score = even * 10 + average;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
function countOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let index2 = 0; index2 < line.length; index2 += 1) {
    const symbol = line[index2];
    if (symbol === '"') {
      if (inQuotes && line[index2 + 1] === '"') index2 += 1;
      else inQuotes = !inQuotes;
    } else if (symbol === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}
function parseCsv(text2, delimiter) {
  const rows = [];
  let row = [];
  let field2 = "";
  let inQuotes = false;
  for (let index2 = 0; index2 < text2.length; index2 += 1) {
    const symbol = text2[index2];
    if (inQuotes) {
      if (symbol === '"') {
        if (text2[index2 + 1] === '"') {
          field2 += '"';
          index2 += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field2 += symbol;
      }
      continue;
    }
    if (symbol === '"') {
      inQuotes = true;
    } else if (symbol === delimiter) {
      row.push(field2);
      field2 = "";
    } else if (symbol === "\r") {
      if (text2[index2 + 1] !== "\n") {
        row.push(field2);
        rows.push(row);
        row = [];
        field2 = "";
      }
    } else if (symbol === "\n") {
      row.push(field2);
      rows.push(row);
      row = [];
      field2 = "";
    } else {
      field2 += symbol;
    }
  }
  if (field2 !== "" || row.length > 0) {
    row.push(field2);
    rows.push(row);
  }
  return rows;
}
function readCsvSheet(buffer, name = "CSV") {
  const decoded = decodeCsv(buffer);
  const delimiter = detectDelimiter(decoded.text);
  const rows = parseCsv(decoded.text, delimiter);
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => String(cell).trim() === "")) rows.pop();
  const cleaned = rows.map((row, rowIndex) => rowIndex < 3 ? row.map((cell) => String(cell).replace(/^"|"$/g, "").trim()) : row.map((cell) => String(cell)));
  return {
    sheet: { name, rows: cleaned },
    delimiter,
    encoding: decoded.encoding,
    transcoded: decoded.encoding !== "utf-8"
  };
}
const LIMITS = {
  maxFileBytes: 30 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxRatio: 150
};
function zipInfo(bytes) {
  if (bytes.length < 22) return null;
  const limit = Math.max(0, bytes.length - 66e3);
  let eocd = -1;
  for (let index2 = bytes.length - 22; index2 >= limit; index2 -= 1) {
    if (bytes[index2] === 80 && bytes[index2 + 1] === 75 && bytes[index2 + 2] === 5 && bytes[index2 + 3] === 6) {
      eocd = index2;
      break;
    }
  }
  if (eocd < 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let uncompressed = 0;
  let compressed = 0;
  let zip64 = false;
  let seen = 0;
  for (let index2 = 0; index2 < entries; index2 += 1) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== 33639248) break;
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    if (compressedSize === 4294967295 || uncompressedSize === 4294967295) zip64 = true;
    compressed += compressedSize;
    uncompressed += uncompressedSize;
    seen += 1;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries: seen, uncompressed, compressed, zip64 };
}
function hasMacros(bytes) {
  const needle = "vbaProject.bin";
  const pattern = [...needle].map((symbol) => symbol.charCodeAt(0));
  const last = bytes.length - pattern.length;
  for (let index2 = 0; index2 <= last; index2 += 1) {
    if (bytes[index2] !== pattern[0]) continue;
    let matched = true;
    for (let offset = 1; offset < pattern.length; offset += 1) {
      if (bytes[index2 + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}
function kindOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xlsm") || lower.endsWith(".xltm")) return "xlsm";
  if (lower.endsWith(".xlsb")) return "xlsb";
  if (lower.endsWith(".xls")) return "xls";
  return "unknown";
}
function inspectFile(name, bytes) {
  const kind = kindOf(name);
  const warnings = [];
  const verdict = {
    ok: true,
    kind,
    warnings,
    bytes: bytes.length,
    zip: null,
    ratio: null,
    macros: false
  };
  if (kind === "unknown") {
    return { ...verdict, ok: false, error: "Формат не поддержан: принимаем XLSX, XLS и CSV." };
  }
  if (kind === "xlsm" || kind === "xlsb") {
    return {
      ...verdict,
      ok: false,
      error: "Файл с макросами или двоичный формат (xlsm/xlsb) не принимаем: сохраните как XLSX. Макросы не выполняются, но и такой файл мы не разбираем — так безопаснее."
    };
  }
  if (bytes.length > LIMITS.maxFileBytes) {
    return {
      ...verdict,
      ok: false,
      error: `Файл больше ${Math.round(LIMITS.maxFileBytes / 1024 / 1024)} МБ — импорт таких файлов не поддержан.`
    };
  }
  if (kind === "xls") {
    warnings.push("Старый формат XLS: значения берутся как есть, формулы не пересчитываются.");
    return verdict;
  }
  if (kind === "csv") {
    warnings.push("CSV: кодировка и разделитель определяются по файлу.");
    return verdict;
  }
  const zip = zipInfo(bytes);
  const macros = hasMacros(bytes);
  const ratio = zip && zip.compressed > 0 ? zip.uncompressed / zip.compressed : null;
  const withZip = { ...verdict, zip, ratio, macros };
  if (zip == null ? void 0 : zip.zip64) {
    return {
      ...withZip,
      ok: false,
      error: "Архив файла слишком большой (ZIP64) — такой файл не принимаем."
    };
  }
  if (zip && zip.uncompressed > LIMITS.maxUncompressedBytes) {
    return {
      ...withZip,
      ok: false,
      error: `Файл разворачивается в ${Math.round(zip.uncompressed / 1024 / 1024)} МБ (предел ${Math.round(LIMITS.maxUncompressedBytes / 1024 / 1024)} МБ) — похоже на архив-бомбу.`
    };
  }
  if (ratio !== null && ratio > LIMITS.maxRatio) {
    return {
      ...withZip,
      ok: false,
      error: `Сжатие ${Math.round(ratio)}× превышает предел ${LIMITS.maxRatio}× — похоже на архив-бомбу.`
    };
  }
  if (macros) {
    return {
      ...withZip,
      ok: false,
      error: "В файле есть макросы (vbaProject.bin): они не выполняются, но такой файл мы не принимаем — сохраните книгу как XLSX без макросов."
    };
  }
  if (zip) {
    warnings.push(`Архив: ${zip.entries} частей, распаковка ${Math.round(zip.uncompressed / 1024)} КБ` + (ratio ? `, сжатие ${ratio.toFixed(1)}×` : "") + ".");
  }
  return withZip;
}
const DEFAULT_CHUNK = 500;
function defaultYield() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
async function analyzeAsync(rows, form, context, options = {}) {
  var _a, _b, _c, _d, _e, _f;
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK);
  const yieldToUi = options.yieldToUi ?? defaultYield;
  const started = Date.now();
  const total = rows.length;
  const items = [];
  const issues = [];
  let materialsSkipped = 0;
  let unresolvedWorks2 = 0;
  let unresolvedLocations = 0;
  let processed = 0;
  let cancelled = false;
  (_a = options.onProgress) == null ? void 0 : _a.call(options, { phase: "normalize", done: 0, total, message: `Строк к разбору: ${total}` });
  while (processed < total) {
    if ((_b = options.isCancelled) == null ? void 0 : _b.call(options)) {
      cancelled = true;
      break;
    }
    const slice = rows.slice(processed, processed + chunkSize);
    for (const row of slice) {
      const result2 = normalizeRow(row, context);
      if (result2.isMaterial) materialsSkipped += 1;
      issues.push(...result2.issues);
      unresolvedWorks2 += result2.issues.filter((issue) => issue.code === "WORK_UNRESOLVED").length;
      unresolvedLocations += result2.issues.filter((issue) => issue.code === "LOCATION_UNRESOLVED").length;
      if (result2.item) items.push(result2.item);
    }
    processed += slice.length;
    (_c = options.onProgress) == null ? void 0 : _c.call(options, {
      phase: "normalize",
      done: processed,
      total,
      message: `Разобрано строк: ${processed} из ${total}`
    });
    await yieldToUi();
  }
  if (cancelled) {
    (_d = options.onProgress) == null ? void 0 : _d.call(options, {
      phase: "done",
      done: processed,
      total,
      message: `Разбор отменён: разобрано ${processed} строк из ${total}`
    });
    return {
      result: assembleResult(items, issues, { rowsTotal: processed, materialsSkipped, unresolvedWorks: unresolvedWorks2, unresolvedLocations }, form),
      cancelled: true,
      processed,
      total,
      elapsedMs: Date.now() - started
    };
  }
  (_e = options.onProgress) == null ? void 0 : _e.call(options, { phase: "finish", done: total, total, message: "Ищем дубли и собираем итоги" });
  const deduped = dedupeItems(items);
  for (const duplicate of deduped.duplicates) {
    issues.push({
      severity: "warning",
      code: "DUPLICATE_ROW",
      message: `Дубль позиции (${duplicate.locationPath.join("/")} · ${duplicate.workRaw}) — строка не создаёт новую позицию`,
      fragment: duplicate.fragment
    });
  }
  const result = assembleResult(
    deduped.items,
    issues,
    { rowsTotal: total, materialsSkipped, unresolvedWorks: unresolvedWorks2, unresolvedLocations },
    form
  );
  (_f = options.onProgress) == null ? void 0 : _f.call(options, { phase: "done", done: total, total, message: `Готово: позиций ${result.rows.length}` });
  return { result, cancelled: false, processed, total, elapsedMs: Date.now() - started };
}
const PLAN_FACT_TEMPLATES_STORE = "PLAN_FACT_TEMPLATES";
function services() {
  const rbi = window.RBI;
  return rbi && rbi.services || {};
}
function storeName() {
  var _a, _b;
  const name = (_b = (_a = services().storage) == null ? void 0 : _a.stores) == null ? void 0 : _b.call(_a)[PLAN_FACT_TEMPLATES_STORE];
  if (!name) throw new Error("Сторадж шаблонов не объявлен — обновите страницу, чтобы применилась миграция");
  return name;
}
function normalizeHeader(value) {
  return text(value).replace(/\s+/g, " ").replace(/[«»"'`]/g, "").trim().toLowerCase();
}
function headerSignature(rows, headerRow, headerRows = 1) {
  const first = Math.max(0, headerRow - 1);
  const last = Math.min(rows.length, first + Math.max(1, headerRows));
  const slice = rows.slice(first, last);
  const width = slice.reduce((max, row) => Math.max(max, row.length), 0);
  const signature = [];
  for (let column = 0; column < width; column += 1) {
    const parts = slice.map((row) => normalizeHeader(row[column])).filter((part) => part !== "");
    signature.push(parts.join(" "));
  }
  return signature;
}
function templateDiff(template, current) {
  const missing = [];
  const moved = [];
  const changed = [];
  const used = /* @__PURE__ */ new Set();
  for (const column of template.columns) {
    const normalized = normalizeHeader(column.headerText);
    const atSavedIndex = current[column.columnIndex - 1] ?? "";
    if (atSavedIndex === normalized) {
      used.add(column.columnIndex - 1);
      continue;
    }
    const foundAt = normalized === "" ? -1 : current.findIndex((label, index2) => label === normalized && !used.has(index2));
    if (foundAt >= 0) {
      used.add(foundAt);
      moved.push({ field: column.field, headerText: column.headerText, from: column.columnIndex, to: foundAt + 1 });
    } else if (atSavedIndex !== "") {
      changed.push({
        field: column.field,
        headerText: column.headerText,
        columnIndex: column.columnIndex,
        found: atSavedIndex
      });
    } else {
      missing.push({ field: column.field, headerText: column.headerText, columnIndex: column.columnIndex });
    }
  }
  const added = current.map((label, index2) => ({ columnIndex: index2 + 1, found: label })).filter((entry) => entry.found !== "" && !used.has(entry.columnIndex - 1));
  return {
    missing,
    moved,
    changed,
    added,
    same: missing.length === 0 && moved.length === 0 && changed.length === 0
  };
}
function repointTemplate(template, current) {
  const diff = templateDiff(template, current);
  const fixes = /* @__PURE__ */ new Map();
  for (const entry of diff.moved) fixes.set(entry.field, entry.to);
  for (const entry of diff.missing) {
    const atSaved = template.columns.find((column) => column.field === entry.field);
    if (atSaved && entry.headerText === "") fixes.set(entry.field, 0);
  }
  return template.columns.map((column) => fixes.has(column.field) ? { ...column, columnIndex: fixes.get(column.field) } : column).filter((column) => column.columnIndex > 0);
}
function applyTemplate(profile, columns, sheetName) {
  return {
    ...profile,
    columns: columns.map((column) => ({ ...column })),
    sheetPattern: sheetName && sheetName !== "" ? sheetName : profile.sheetPattern
  };
}
async function listTemplates(formId) {
  var _a, _b;
  const stored = await ((_b = (_a = services().storage) == null ? void 0 : _a.getAll) == null ? void 0 : _b.call(_a, storeName())) ?? [];
  return stored.filter((template) => template && !template.isDeleted && (!formId || template.formId === formId)).sort((left, right) => left.name.localeCompare(right.name, "ru"));
}
async function saveTemplate(input) {
  const storage2 = services().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Название шаблона обязательно" };
  if (!input.columns.length) return { ok: false, error: "В шаблоне нет ни одной колонки" };
  const existing = (await listTemplates(input.formId)).find((template) => template.id === input.id || template.name.toLowerCase() === name.toLowerCase());
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const generator = storage2.generateId;
  const record = {
    id: (existing == null ? void 0 : existing.id) ?? (typeof generator === "function" ? generator("pftpl") : `pftpl_${Date.now().toString(36)}`),
    name,
    formId: input.formId,
    profileId: input.profileId,
    sheetName: input.sheetName,
    columns: input.columns.map((column) => ({ ...column })),
    headerSignature: [...input.headerSignature],
    version: ((existing == null ? void 0 : existing.version) ?? 0) + 1,
    createdAt: (existing == null ? void 0 : existing.createdAt) ?? now,
    updatedAt: now,
    usedCount: (existing == null ? void 0 : existing.usedCount) ?? 0,
    createdBy: (existing == null ? void 0 : existing.createdBy) || currentAuthor(),
    note: "",
    syncStatus: "pending"
  };
  await storage2.put(storeName(), record);
  return { ok: true, record };
}
async function removeTemplate(id) {
  const storage2 = services().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return { ok: false, error: "Сервис storage недоступен" };
  const current = (await listTemplates()).find((template) => template.id === id);
  if (!current) return { ok: true };
  await storage2.put(storeName(), { ...current, isDeleted: true, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), syncStatus: "pending" });
  return { ok: true };
}
async function markTemplateUsed(id) {
  const storage2 = services().storage;
  if (!(storage2 == null ? void 0 : storage2.getAll) || !(storage2 == null ? void 0 : storage2.put)) return;
  const current = (await listTemplates()).find((template) => template.id === id);
  if (!current) return;
  await storage2.put(storeName(), {
    ...current,
    usedCount: (current.usedCount ?? 0) + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    syncStatus: current.syncStatus === "synced" ? "synced" : "pending"
  });
}
function currentAuthor() {
  const permissions = services().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === "function" ? String(permissions.getCurrentEngineerName() || "") : "";
}
const TABLE_LIMIT = 200;
const state$1 = {
  workOptions: [],
  autoMatched: [],
  canManageWorks: false,
  positionsSort: { ...NO_SORT },
  totalsSort: { ...NO_SORT },
  objectId: "",
  profileId: FORM_PROFILES[0].id,
  filename: "",
  fileKind: "",
  fileNote: "",
  sheets: [],
  sheetName: "",
  /** Колонки, изменённые шаблоном или вручную: null — берём колонки профиля. */
  columnOverrides: null,
  headerLabels: [],
  headerRowUsed: 0,
  headerNote: "",
  templates: [],
  templateId: "",
  templateName: "",
  templateWarning: null,
  analysis: null,
  saved: [],
  savedRows: 0,
  savedByWork: [],
  note: "",
  error: "",
  busy: false,
  guardWarnings: [],
  progress: null,
  cancelled: false,
  issuesTotal: 0
};
function root() {
  return document.getElementById("pf-vor-root");
}
function escapeHtml$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function currentForm() {
  return formProfileById(state$1.profileId) ?? FORM_PROFILES[0];
}
function currentProfile() {
  const form = currentForm();
  let profile = state$1.columnOverrides ? applyTemplate(form.profile, state$1.columnOverrides, state$1.sheetName) : form.profile;
  if (state$1.headerRowUsed > 0 && state$1.headerRowUsed !== profile.headerRow) {
    profile = { ...profile, headerRow: state$1.headerRowUsed, headerRows: 1 };
  }
  return profile;
}
function refreshHeaderLabels() {
  const profile = currentProfile();
  const sheet = state$1.sheets.find((item) => item.name === state$1.sheetName) ?? state$1.sheets[0] ?? null;
  if (!sheet) {
    state$1.headerLabels = [];
    state$1.headerRowUsed = 0;
    state$1.headerNote = "";
    return;
  }
  const firstFilled = sheet.rows.findIndex((row) => row.some((cell) => text(cell).trim() !== "")) + 1;
  const csvDefault = state$1.fileKind === "csv" && firstFilled > 0 ? firstFilled : profile.headerRow;
  state$1.headerRowUsed = csvDefault;
  state$1.headerNote = state$1.fileKind === "csv" && csvDefault !== profile.headerRow ? `CSV: шапка взята из первой строки (профиль «${profile.name}» описывает Excel-форму со строкой ${profile.headerRow}).` : "";
  let labels = state$1.fileKind === "csv" ? headerSignature(sheet.rows, csvDefault, 1) : headerSignature(sheet.rows, csvDefault, profile.headerRows);
  if (labels.every((label) => label === "")) {
    const first = sheet.rows.findIndex((row) => row.some((cell) => text(cell).trim() !== ""));
    labels = first >= 0 ? headerSignature(sheet.rows, first + 1, 1) : [];
    if (labels.length > 0) {
      state$1.headerRowUsed = first + 1;
      state$1.headerNote = `Профиль ждёт шапку на строке ${profile.headerRow}, в файле она на строке ${first + 1} — взял её.`;
    }
  }
  state$1.headerLabels = labels;
}
async function loadTemplates() {
  try {
    state$1.templates = await listTemplates(state$1.profileId);
  } catch (_error) {
    state$1.templates = [];
  }
}
async function loadSaved() {
  if (!state$1.objectId) {
    state$1.saved = [];
    state$1.savedRows = 0;
    state$1.savedByWork = [];
    return;
  }
  const [imports, rows] = await Promise.all([
    listImports(state$1.objectId),
    listWorRows(state$1.objectId)
  ]);
  state$1.savedRows = rows.length;
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.quantity = addDecimal(bucket.quantity, row.quantity);
    else groups.set(key, { workTitle: row.workRaw, unit: row.unitRaw || row.unit || "", quantity: row.quantity });
  }
  state$1.savedByWork = [...groups.values()].sort((left, right) => left.workTitle.localeCompare(right.workTitle));
  state$1.saved = imports.map((record) => {
    var _a, _b, _c;
    return {
      id: record.id,
      filename: record.filename,
      sheet: record.sheet,
      profileTitle: record.profileTitle,
      createdAt: String(record.createdAt).slice(0, 16).replace("T", " "),
      items: ((_a = record.stats) == null ? void 0 : _a.items) ?? 0,
      matched: ((_b = record.stats) == null ? void 0 : _b.matched) ?? 0,
      matchedPercent: ((_c = record.stats) == null ? void 0 : _c.matchedPercent) ?? 0
    };
  });
}
async function mountVorPanel(objectId) {
  const container = root();
  if (!container) return;
  state$1.canManageWorks = canManageWorks();
  void loadTemplates();
  if (state$1.objectId !== objectId) {
    state$1.objectId = objectId;
    state$1.analysis = null;
  }
  try {
    await loadSaved();
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
  }
  render();
}
function statsHtml() {
  const analysis = state$1.analysis;
  if (!analysis) return "";
  const stats = analysis.stats;
  const cell = (label, value, tone = "text-ink") => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml$1(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml$1(value)}</div>
    </div>`;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${cell("Строк листа", String(stats.rows))}
      ${cell("Позиций ВОР", String(stats.items))}
      ${cell("Сопоставлено", `${stats.matched} · ${formatDecimal(String(stats.matchedPercent), 1)}%`)}
      ${cell("Требует решения", String(stats.needsDecision), stats.needsDecision > 0 ? "text-danger" : "text-ink")}
      ${cell("Материалов пропущено", String(stats.materialsSkipped))}
      ${cell("Не разобрано локаций", String(stats.unresolvedLocations), stats.unresolvedLocations > 0 ? "text-danger" : "text-ink")}
      ${cell("Лист", stats.sheet || "—")}
      ${cell("Всего сохранено в объект", String(state$1.savedRows))}
    </div>`;
}
function issuesHtml() {
  const analysis = state$1.analysis;
  if (!analysis || analysis.issues.length === 0) return "";
  const rows = analysis.issues.slice(0, 12).map((issue) => `
      <li class="text-rbi-caption ${issue.severity === "error" ? "text-danger" : "text-muted"}">
        строка ${issue.fragment.row}: ${escapeHtml$1(issue.message)}
      </li>`).join("");
  const more = analysis.issues.length > 12 ? `<li class="text-rbi-caption text-muted">…и ещё ${analysis.issues.length - 12}</li>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Замечания разбора</div>
      <ul class="space-y-0.5">${rows}${more}</ul>
    </div>`;
}
const TOTAL_COLUMNS = [
  { key: "work", title: "Вид работ", value: (row) => row.workTitle },
  { key: "unit", title: "ЕИ", value: (row) => row.unit },
  { key: "quantity", title: "Итого", value: (row) => row.quantity }
];
function totalsHtml() {
  const analysis = state$1.analysis;
  if (!analysis || analysis.rows.length === 0) return "";
  const sortedTotals = sortRows(totalsByWork(analysis.rows), state$1.totalsSort, (row, key) => {
    const column = TOTAL_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : "";
  });
  const totals = sortedTotals.slice(0, 12);
  const head = TOTAL_COLUMNS.map((column) => {
    const active = state$1.totalsSort.key === column.key;
    const align = column.key === "quantity" ? "text-right" : "";
    return `<th data-sort-key="${escapeHtml$1(column.key)}"
      class="${sortableHeaderClass(active, `py-1 pr-2 font-normal ${align}`)}">${escapeHtml$1(column.title)}</th>`;
  }).join("");
  const rows = totals.map((total) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml$1(total.workTitle)}</td>
      <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml$1(total.unit)}</td>
      <td class="py-1 text-rbi-body text-ink text-right">${escapeHtml$1(formatDecimal(total.quantity))}</td>
    </tr>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Итого по видам работ (точно, без float)</div>
      <table id="pf-totals-table" class="w-full">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
const POSITION_COLUMNS = [
  { key: "section", title: "Секция", value: (row) => row.section },
  { key: "floor", title: "Этаж", value: (row) => row.floor },
  { key: "place", title: "Помещение", value: (row) => row.place },
  { key: "work", title: "Работа", value: (row) => row.workRaw },
  { key: "unit", title: "ЕИ", value: (row) => row.unitRaw },
  { key: "quantity", title: "Объём", value: (row) => row.quantity },
  { key: "status", title: "Статус", value: (row) => row.workId === null ? "не сопоставлено" : "сопоставлено" }
];
function positionsValue(row, key) {
  const column = POSITION_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : "";
}
function unresolvedHtml() {
  const analysis = state$1.analysis;
  if (!analysis) return "";
  const list = unresolvedWorks(analysis.rows);
  if (list.length === 0) return "";
  const totalRows = list.reduce((sum, entry) => sum + entry.count, 0);
  const options = state$1.workOptions.map((work) => `<option value="${escapeHtml$1(work.id)}">${escapeHtml$1(`${work.groupName}: ${work.name}`)}</option>`).join("");
  const rows = list.slice(0, 20).map((entry) => {
    if (!state$1.canManageWorks) {
      return `<li class="text-rbi-caption text-muted">${escapeHtml$1(entry.raw)} — ${entry.count} стр.,
        ${escapeHtml$1(entry.units.join(", ") || "без единицы")}</li>`;
    }
    return `
      <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
        <span class="text-rbi-body text-ink">${escapeHtml$1(entry.raw)}</span>
        <span class="text-rbi-caption text-muted">${entry.count} стр. · ${escapeHtml$1(entry.units.join(", ") || "без единицы")}</span>
        <select data-pf-link-raw="${escapeHtml$1(entry.raw)}"
          class="bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1 max-w-[280px]">
          <option value="">— выберите вид работ —</option>
          ${options}
        </select>
        <button type="button" data-pf-link-go="${escapeHtml$1(entry.raw)}"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Связать</button>
      </li>`;
  }).join("");
  const more = list.length > 20 ? `<li class="text-rbi-caption text-muted">…и ещё ${list.length - 20} формулировок</li>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Не сопоставлено: ${list.length} формулировок,
        ${totalRows} строк</div>
      <div class="text-rbi-caption text-muted mb-2">
        ${state$1.canManageWorks ? "Свяжите формулировку с видом работ — связка сохранится и применится к следующим импортам этой формы." : "Связки ведёт ПТО: у вашей роли права на правку нет, список — для сведения."}
      </div>
      <ul class="list-none p-0 m-0">${rows}${more}</ul>
    </div>`;
}
function confirmHtml() {
  const list = state$1.autoMatched;
  if (list.length === 0) return "";
  const total = list.reduce((sum, item) => sum + item.count, 0);
  if (!state$1.canManageWorks) {
    return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сопоставлено программой: ${list.length} формулировок,
        ${total} строк</div>
      <div class="text-rbi-caption text-muted">Подтверждает ПТО: у вашей роли права на правку нет.</div>
    </div>`;
  }
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сопоставлено программой: ${list.length} формулировок,
        ${total} строк
        <span class="text-rbi-caption text-muted font-normal">· подтвердите, если совпадение верное</span></div>
      <ul class="list-none p-0 m-0">
        ${list.slice(0, 15).map((item) => `
          <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
            <span class="text-rbi-body text-ink">${escapeHtml$1(item.raw)}</span>
            <span class="text-rbi-caption text-muted">${item.count} стр. · вид работ: ${escapeHtml$1(item.workTitle)}</span>
            <button type="button" data-pf-confirm="${escapeHtml$1(item.raw)}"
              data-pf-confirm-work="${escapeHtml$1(item.workId)}"
              class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Подтвердить</button>
          </li>`).join("")}
      </ul>
      ${list.length > 15 ? `<div class="text-rbi-caption text-muted mt-1">…и ещё ${list.length - 15} формулировок</div>` : ""}
      <div class="mt-2">
        <button type="button" id="pf-confirm-all"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">
          Подтвердить все (${list.length})</button>
      </div>
    </div>`;
}
function tableHtml() {
  const analysis = state$1.analysis;
  if (!analysis) return "";
  if (analysis.rows.length === 0) {
    return `
      <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
        <div class="text-rbi-body text-muted">Разбор не дал ни одной позиции: проверьте профиль формы и лист.
        Пустая ячейка объёма позицией не является — ноль и пустое различаются.</div>
      </div>`;
  }
  const ordered = sortRows(analysis.rows, state$1.positionsSort, positionsValue);
  const shown = ordered.slice(0, TABLE_LIMIT);
  const rows = shown.map((row) => {
    const unresolved = row.workId === null;
    return `
      <tr class="border-b border-surface ${unresolved ? "bg-danger-soft" : ""}">
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml$1(row.section)}</td>
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml$1(row.floor)}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml$1(row.place)}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml$1(row.workRaw)}</td>
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml$1(row.unitRaw || row.unit || "")}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink text-right">${escapeHtml$1(formatDecimal(row.quantity))}</td>
        <td class="py-1 text-rbi-caption ${unresolved ? "text-danger" : "text-muted"}">
          ${unresolved ? "требует решения" : "сопоставлено"}
        </td>
      </tr>`;
  }).join("");
  const tail = analysis.rows.length > shown.length ? `<div class="text-rbi-caption text-muted mt-2">Показано ${shown.length} из ${analysis.rows.length} позиций —
       остальные сохранены в объект целиком, ограничение только у таблицы.</div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Позиции ВОР</div>
      <table id="pf-positions-table" class="w-full min-w-[640px]">
        <thead>
          <tr class="text-rbi-caption text-muted text-left border-b border-surface">
            ${POSITION_COLUMNS.map((column) => {
    const active = state$1.positionsSort.key === column.key;
    const align = column.key === "quantity" ? "text-right" : "";
    return `<th data-sort-key="${escapeHtml$1(column.key)}"
                class="${sortableHeaderClass(active, `py-1 pr-2 font-normal ${align}`)}">${escapeHtml$1(column.title)}</th>`;
  }).join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${tail}
    </div>`;
}
function savedHtml() {
  if (!state$1.objectId) {
    return `<div class="text-rbi-caption text-muted">Выберите объект — ВОР сохраняется в его рамках.</div>`;
  }
  if (state$1.saved.length === 0) {
    return `<div class="text-rbi-caption text-muted">В этом объекте пока нет сохранённой ВОР.</div>`;
  }
  const items = state$1.saved.map((record) => `
    <li class="flex items-start justify-between gap-2 py-1 border-b border-surface">
      <div class="min-w-0">
        <div class="text-rbi-body text-ink truncate">${escapeHtml$1(record.filename || "файл")} · ${escapeHtml$1(record.sheet)}</div>
        <div class="text-rbi-caption text-muted">${escapeHtml$1(record.profileTitle)} · ${record.items} позиций ·
          сопоставлено ${record.matched} (${formatDecimal(String(record.matchedPercent), 1)}%) · ${escapeHtml$1(record.createdAt)}</div>
      </div>
      <button type="button" data-pf-delete="${escapeHtml$1(record.id)}"
        class="shrink-0 text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-1 rounded-lg">Удалить</button>
    </li>`).join("");
  const totals = state$1.savedByWork.slice(0, 10).map((total) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml$1(total.workTitle)}</td>
      <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml$1(total.unit)}</td>
      <td class="py-1 text-rbi-body text-ink text-right">${escapeHtml$1(formatDecimal(total.quantity))}</td>
    </tr>`).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сохранено в объект: ${state$1.savedRows} позиций</div>
      <ul class="mb-2">${items}</ul>
      ${totals ? `<table class="w-full"><tbody>${totals}</tbody></table>` : ""}
    </div>`;
}
const FIELD_TITLES = {
  code: "Код",
  name: "Работа",
  unit: "Единица",
  quantity: "Объём",
  norm_consumption: "Норма расхода",
  norm_output: "Выработка",
  norm_output_unit: "Единица выработки",
  man_days: "Человеко-дни",
  crew: "Состав звена",
  section_floor: "Этаж",
  price: "Цена",
  total: "Сумма",
  marker: "Признак (работа/материал)",
  location_label: "Помещение"
};
const LAYOUT_FIELDS = {
  // Локации строками: без этажа и помещения позиции не собрать.
  outline_location_rows: ["section_floor", "location_label", "name", "unit", "quantity", "marker"],
  // Локации помечены маркерами: важнее признак и место.
  outline_markers: ["marker", "section_floor", "location_label", "name", "unit", "quantity"],
  // Обмерная матрица: место в колонках, работы — отдельными колонками.
  measurement_matrix: ["section_floor", "location_label", "marker"],
  // График и нормы: работа, выработка и звено.
  norms_schedule: ["name", "unit", "norm_output", "norm_output_unit", "crew", "man_days"],
  unknown: ["section_floor", "location_label", "name", "unit", "quantity", "marker"]
};
function mappingFields() {
  const profile = currentProfile();
  const declared = profile.columns.map((column) => column.field);
  const needed = LAYOUT_FIELDS[profile.layout] ?? [];
  return [...declared, ...needed.filter((field2) => !declared.includes(field2))];
}
function effectiveColumns() {
  return state$1.columnOverrides ?? currentForm().profile.columns.map((column) => ({ ...column }));
}
function columnsHtml() {
  if (state$1.sheets.length === 0) return "";
  currentProfile();
  const columns = effectiveColumns();
  const width = state$1.headerLabels.length;
  const columnOptions = (selected) => {
    const options = [`<option value="0"${selected === 0 ? " selected" : ""}>не использовать</option>`];
    for (let index2 = 0; index2 < width; index2 += 1) {
      const label = state$1.headerLabels[index2] || "—";
      options.push(`<option value="${index2 + 1}"${selected === index2 + 1 ? " selected" : ""}>${escapeHtml$1(`${index2 + 1}. ${label}`)}</option>`);
    }
    return options.join("");
  };
  const rows = mappingFields().map((field2) => {
    var _a;
    const current = ((_a = columns.find((column) => column.field === field2)) == null ? void 0 : _a.columnIndex) ?? 0;
    const fromProfile = currentForm().profile.columns.find((column) => column.field === field2);
    return `
    <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
      <span class="text-rbi-caption text-muted w-40">${escapeHtml$1(FIELD_TITLES[field2] ?? field2)}</span>
      <select data-pf-column="${escapeHtml$1(field2)}"
        class="bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1 max-w-[260px]">
        ${columnOptions(current)}
      </select>
      <span class="text-rbi-caption ${fromProfile ? "text-muted" : "text-brand"}">
        ${fromProfile ? `в профиле: «${escapeHtml$1(fromProfile.headerText)}»` : "профиль эту колонку не описывает — задайте вручную"}
      </span>
    </li>`;
  }).join("");
  const templateOptions = state$1.templates.map((template) => `
    <option value="${escapeHtml$1(template.id)}"${template.id === state$1.templateId ? " selected" : ""}>
      ${escapeHtml$1(`${template.name} · v${template.version}${template.usedCount ? ` · применений: ${template.usedCount}` : ""}`)}
    </option>`).join("");
  const warning = state$1.templateWarning;
  const warningHtml = warning && !warning.same ? `<div class="text-rbi-caption text-danger mt-2">
        Колонки в файле отличаются от шаблона:
        ${warning.moved.map((entry) => `«${escapeHtml$1(entry.headerText)}» переехала с ${entry.from} на ${entry.to}`).join("; ")}
        ${warning.missing.map((entry) => `«${escapeHtml$1(entry.headerText)}» не найдена`).join("; ")}
        ${warning.changed.map((entry) => `на месте «${escapeHtml$1(entry.headerText)}» теперь «${escapeHtml$1(entry.found)}»`).join("; ")}
        ${warning.added.length ? `· новых колонок: ${warning.added.length}` : ""}
      </div>` : "";
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Колонки и шаблон
        <span class="text-rbi-caption text-muted font-normal">
          · ${state$1.fileKind === "csv" ? "CSV" : "XLSX"}${state$1.fileNote ? `, ${escapeHtml$1(state$1.fileNote)}` : ""}
        </span></div>
      <div class="flex flex-wrap items-end gap-2 mb-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Шапка: строка</span>
          <input id="pf-header-row" type="number" min="1" value="${state$1.headerRowUsed || currentProfile().headerRow}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <span class="text-rbi-caption text-muted">Та же строка используется при разборе — колонки и строки не разъезжаются.</span>
      </div>
      ${state$1.headerNote ? `<div class="text-rbi-caption text-brand mb-2">${escapeHtml$1(state$1.headerNote)}</div>` : ""}
      <ul class="list-none p-0 m-0 mb-2">${rows}</ul>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Шаблон</span>
          <select id="pf-template" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 min-w-[220px]">
            <option value="">— не выбран —</option>${templateOptions}
          </select>
        </label>
        <button type="button" id="pf-template-apply" ${state$1.templateId ? "" : "disabled"}
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">Применить</button>
        ${warning && (warning.moved.length || warning.missing.length || warning.changed.length) ? `<button type="button" id="pf-template-fix"
              class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Поправить по заголовкам</button>` : ""}
        <button type="button" id="pf-template-delete" ${state$1.templateId ? "" : "disabled"}
          class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl disabled:opacity-50">Удалить шаблон</button>
        <label class="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span class="text-rbi-label text-muted">Сохранить как шаблон</span>
          <input id="pf-template-name" type="text" value="${escapeHtml$1(state$1.templateName)}"
            placeholder="например: ФКП, плоский список"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-template-save"
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Сохранить шаблон</button>
        ${state$1.columnOverrides ? `<button type="button" id="pf-columns-reset"
          class="text-rbi-caption font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Вернуть колонки профиля</button>` : ""}
      </div>
      ${warningHtml}
      <div class="text-rbi-caption text-muted mt-2">
        Шаблон запоминает, какая колонка листа берётся для какого поля, и версию. Повторное сохранение
        под тем же именем поднимает версию, а не создаёт второй шаблон.
      </div>
    </div>`;
}
function render() {
  const container = root();
  if (!container) return;
  const form = currentForm();
  const profileOptions = FORM_PROFILES.map((item) => `
    <option value="${escapeHtml$1(item.id)}"${item.id === form.id ? " selected" : ""}>${escapeHtml$1(item.title)}</option>`).join("");
  const sheetOptions = state$1.sheets.map((sheet) => `
    <option value="${escapeHtml$1(sheet.name)}"${sheet.name === state$1.sheetName ? " selected" : ""}>${escapeHtml$1(sheet.name)}</option>`).join("");
  const canParse = state$1.sheets.length > 0 && !state$1.busy;
  const canSave = !!state$1.analysis && state$1.analysis.rows.length > 0 && !!state$1.objectId && !state$1.busy;
  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Загрузка формы заказчика (XLSX)</div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Профиль формы</span>
          <select id="pf-profile" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${profileOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Файл</span>
          <input id="pf-file" type="file" accept=".xlsx,.xls" class="text-rbi-body text-ink" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Лист</span>
          <select id="pf-sheet" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5"
            ${state$1.sheets.length ? "" : "disabled"}>${sheetOptions || '<option value="">—</option>'}</select>
        </label>
        <button type="button" id="pf-parse" ${canParse ? "" : "disabled"}
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">Разобрать</button>
        <button type="button" id="pf-save" ${canSave ? "" : "disabled"}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Сохранить в объект</button>
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        ${state$1.filename ? `Файл: ${escapeHtml$1(state$1.filename)} · листов: ${state$1.sheets.length}` : "Файл не выбран."}
        ${state$1.busy ? " · идёт разбор…" : ""}
        ${state$1.issuesTotal ? ` · строк в протоколе проблем: ${state$1.issuesTotal}` : ""}
      </div>
      ${state$1.progress ? `
        <div class="mt-2">
          <div class="w-full bg-surface border border-surface rounded-full h-2 overflow-hidden">
            <div class="bg-brand h-2" style="width:${Math.min(100, Math.round(state$1.progress.done / Math.max(1, state$1.progress.total) * 100))}%"></div>
          </div>
          <div class="flex items-center justify-between gap-2 mt-1">
            <span class="text-rbi-caption text-muted">${escapeHtml$1(state$1.progress.message)}</span>
            <button type="button" id="pf-cancel"
              class="text-rbi-caption font-bold text-danger border border-surface px-2 py-1 rounded-lg">Отменить</button>
          </div>
        </div>` : ""}
      ${state$1.cancelled ? `<div class="text-rbi-caption text-danger mt-1">
        Разбор отменён — это неполные данные. Нажмите «Разобрать», чтобы пройти файл целиком.</div>` : ""}
      ${state$1.guardWarnings.length ? `<div class="text-rbi-caption text-muted mt-1">
        ${state$1.guardWarnings.map((warning) => escapeHtml$1(warning)).join("<br>")}</div>` : ""}
      ${state$1.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml$1(state$1.note)}</div>` : ""}
      ${state$1.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml$1(state$1.error)}</div>` : ""}
    </div>
    ${columnsHtml()}
    ${statsHtml()}
    ${unresolvedHtml()}
    ${confirmHtml()}
    ${totalsHtml()}
    ${tableHtml()}
    ${issuesHtml()}
    ${savedHtml()}
  `;
  bind$1();
}
function bindColumns(container) {
  var _a, _b, _c, _d, _e, _f;
  container.querySelectorAll("[data-pf-column]").forEach((select) => {
    select.addEventListener("change", () => {
      const field2 = select.getAttribute("data-pf-column") ?? "";
      const base = effectiveColumns();
      const index2 = Number(select.value) || 0;
      const existing = base.find((column) => column.field === field2);
      const headerText = index2 > 0 ? state$1.headerLabels[index2 - 1] || `Колонка ${index2}` : "";
      const next = existing ? base.map((column) => column.field === field2 ? { ...column, columnIndex: index2, headerText } : column) : [...base, { field: field2, columnIndex: index2, headerText }];
      state$1.columnOverrides = next.filter((column) => column.columnIndex > 0);
      state$1.analysis = null;
      state$1.note = `Колонка «${FIELD_TITLES[field2] ?? field2}» → ${index2 > 0 ? `«${headerText}»` : "не используется"}.`;
      render();
    });
  });
  (_a = container.querySelector("#pf-header-row")) == null ? void 0 : _a.addEventListener("change", (event) => {
    const value = Number(event.target.value);
    state$1.headerRowUsed = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    state$1.analysis = null;
    state$1.note = `Шапка: строка ${state$1.headerRowUsed}.`;
    refreshHeaderLabels();
    render();
  });
  const templateSelect = container.querySelector("#pf-template");
  templateSelect == null ? void 0 : templateSelect.addEventListener("change", () => {
    state$1.templateId = templateSelect.value;
    const template = state$1.templates.find((item) => item.id === state$1.templateId) ?? null;
    state$1.templateWarning = template ? templateDiff(template, state$1.headerLabels) : null;
    state$1.templateName = (template == null ? void 0 : template.name) ?? state$1.templateName;
    state$1.note = template ? `Шаблон «${template.name}» версии ${template.version} выбран.` : "";
    render();
  });
  (_b = container.querySelector("#pf-template-apply")) == null ? void 0 : _b.addEventListener("click", () => {
    void runApplyTemplate(false);
  });
  (_c = container.querySelector("#pf-template-fix")) == null ? void 0 : _c.addEventListener("click", () => {
    void runApplyTemplate(true);
  });
  (_d = container.querySelector("#pf-template-save")) == null ? void 0 : _d.addEventListener("click", () => {
    void runSaveTemplate();
  });
  (_e = container.querySelector("#pf-template-delete")) == null ? void 0 : _e.addEventListener("click", () => {
    void runDeleteTemplate();
  });
  (_f = container.querySelector("#pf-columns-reset")) == null ? void 0 : _f.addEventListener("click", () => {
    state$1.columnOverrides = null;
    state$1.templateWarning = null;
    state$1.analysis = null;
    refreshHeaderLabels();
    state$1.note = "Колонки вернулись к профилю из кода.";
    render();
  });
}
async function runApplyTemplate(fixByHeaders) {
  const template = state$1.templates.find((item) => item.id === state$1.templateId);
  if (!template) return;
  const columns = fixByHeaders ? repointTemplate(template, state$1.headerLabels) : template.columns;
  if (columns.length === 0) {
    state$1.error = "В шаблоне не осталось ни одной колонки — проверьте сопоставление вручную.";
    render();
    return;
  }
  state$1.columnOverrides = columns.map((column) => ({ ...column }));
  state$1.analysis = null;
  state$1.error = "";
  refreshHeaderLabels();
  await markTemplateUsed(template.id);
  await loadTemplates();
  const warning = templateDiff(template, state$1.headerLabels);
  state$1.templateWarning = warning;
  state$1.note = warning.same ? `Шаблон «${template.name}» применён: колонки совпали с файлом.` : `Шаблон «${template.name}» применён, но колонки отличаются — проверьте список ниже.`;
  render();
}
async function runSaveTemplate() {
  var _a, _b, _c, _d, _e;
  const nameInput = (_a = root()) == null ? void 0 : _a.querySelector("#pf-template-name");
  const name = (nameInput == null ? void 0 : nameInput.value) ?? state$1.templateName;
  const columns = effectiveColumns();
  const result = await saveTemplate({
    name,
    formId: state$1.profileId,
    profileId: currentProfile().id,
    sheetName: state$1.sheetName,
    columns,
    headerSignature: state$1.headerLabels
  });
  if (!result.ok) {
    state$1.error = result.error ?? "Не удалось сохранить шаблон";
  } else {
    state$1.templateId = ((_b = result.record) == null ? void 0 : _b.id) ?? "";
    state$1.templateName = ((_c = result.record) == null ? void 0 : _c.name) ?? name;
    state$1.error = "";
    state$1.note = `Шаблон «${(_d = result.record) == null ? void 0 : _d.name}» сохранён, версия ${(_e = result.record) == null ? void 0 : _e.version}.`;
  }
  await loadTemplates();
  render();
}
async function runDeleteTemplate() {
  const template = state$1.templates.find((item) => item.id === state$1.templateId);
  if (!template) return;
  const result = await removeTemplate(template.id);
  state$1.templateId = "";
  state$1.templateWarning = null;
  state$1.note = result.ok ? `Шаблон «${template.name}» удалён.` : result.error ?? "Не удалось удалить шаблон";
  await loadTemplates();
  render();
}
function bind$1() {
  var _a, _b, _c, _d;
  const container = root();
  if (!container) return;
  bindColumns(container);
  container.querySelectorAll("[data-pf-confirm]").forEach((button) => {
    button.addEventListener("click", () => {
      void runConfirm([{
        raw: button.getAttribute("data-pf-confirm") ?? "",
        workId: button.getAttribute("data-pf-confirm-work") ?? ""
      }]);
    });
  });
  (_a = container.querySelector("#pf-confirm-all")) == null ? void 0 : _a.addEventListener("click", () => {
    void runConfirm(state$1.autoMatched.map((item) => ({ raw: item.raw, workId: item.workId })));
  });
  container.querySelectorAll("[data-pf-link-go]").forEach((button) => {
    button.addEventListener("click", () => {
      void runLink(button.getAttribute("data-pf-link-go") ?? "");
    });
  });
  bindSortableTable(container.querySelector("#pf-positions-table"), state$1.positionsSort, (next) => {
    state$1.positionsSort = next;
    render();
  });
  bindSortableTable(container.querySelector("#pf-totals-table"), state$1.totalsSort, (next) => {
    state$1.totalsSort = next;
    render();
  });
  const profileSelect = container.querySelector("#pf-profile");
  profileSelect == null ? void 0 : profileSelect.addEventListener("change", () => {
    state$1.profileId = profileSelect.value;
    state$1.analysis = null;
    state$1.columnOverrides = null;
    state$1.templateWarning = null;
    state$1.headerRowUsed = 0;
    state$1.note = "";
    state$1.error = "";
    pickDefaultSheet();
    render();
  });
  const fileInput = container.querySelector("#pf-file");
  fileInput == null ? void 0 : fileInput.addEventListener("change", () => {
    var _a2;
    const file = (_a2 = fileInput.files) == null ? void 0 : _a2[0];
    if (!file) return;
    void readFile(file);
  });
  const sheetSelect = container.querySelector("#pf-sheet");
  sheetSelect == null ? void 0 : sheetSelect.addEventListener("change", () => {
    state$1.sheetName = sheetSelect.value;
    state$1.analysis = null;
    state$1.note = "";
    state$1.headerRowUsed = 0;
    refreshHeaderLabels();
    render();
  });
  (_b = container.querySelector("#pf-parse")) == null ? void 0 : _b.addEventListener("click", () => {
    void runParse();
  });
  (_c = container.querySelector("#pf-cancel")) == null ? void 0 : _c.addEventListener("click", () => {
    cancelRequested = true;
    state$1.note = "Останавливаю разбор — дождусь конца текущей порции…";
    render();
  });
  (_d = container.querySelector("#pf-save")) == null ? void 0 : _d.addEventListener("click", () => {
    void runSave();
  });
  container.querySelectorAll("[data-pf-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const importId = button.getAttribute("data-pf-delete");
      if (importId) void runDelete(importId);
    });
  });
}
function pickDefaultSheet() {
  const sheet = pickSheet(state$1.sheets, currentProfile());
  state$1.sheetName = (sheet == null ? void 0 : sheet.name) ?? "";
  refreshHeaderLabels();
}
async function readFile(file) {
  state$1.busy = true;
  state$1.error = "";
  state$1.note = "";
  state$1.analysis = null;
  render();
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const verdict = inspectFile(file.name, bytes);
    state$1.guardWarnings = [...verdict.warnings];
    if (!verdict.ok) {
      state$1.error = verdict.error ?? "Файл не принят";
      state$1.sheets = [];
      state$1.sheetName = "";
      state$1.filename = "";
      state$1.analysis = null;
      state$1.busy = false;
      render();
      return;
    }
    if (verdict.kind !== "csv" && bytes.length < 8 * 1024 * 1024) {
      const formulas = countFormulaCells(bytes);
      if (formulas.formulas > 0) {
        state$1.guardWarnings.push(
          `В книге ${formulas.formulas} ячеек с формулами (листы: ${formulas.sheets.join(", ")}): берутся сохранённые значения — если файл давно не открывали, числа могли устареть.`
        );
      }
    }
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    if (isCsv) {
      const csv = readCsvSheet(buffer, file.name);
      state$1.sheets = [csv.sheet];
      state$1.fileKind = "csv";
      state$1.fileNote = `CSV, разделитель «${csv.delimiter === "	" ? "табуляция" : csv.delimiter}»` + (csv.transcoded ? ", файл был в windows-1251 — перекодирован" : ", кодировка UTF-8");
    } else {
      state$1.sheets = readXlsxSheets(buffer);
      state$1.fileKind = "xlsx";
      state$1.fileNote = "";
    }
    state$1.filename = file.name;
    state$1.columnOverrides = null;
    state$1.templateWarning = null;
    state$1.headerRowUsed = 0;
    state$1.cancelled = false;
    state$1.progress = null;
    state$1.issuesTotal = 0;
    pickDefaultSheet();
    state$1.note = (isCsv ? "Лист CSV загружен." : `Листов в файле: ${state$1.sheets.length}.`) + ` Профиль «${currentForm().title}» возьмёт лист «${state$1.sheetName}».`;
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
    state$1.sheets = [];
    state$1.sheetName = "";
    state$1.filename = "";
  }
  state$1.busy = false;
  render();
}
let cancelRequested = false;
async function runParse() {
  const form = currentForm();
  state$1.busy = true;
  state$1.error = "";
  state$1.note = "";
  state$1.cancelled = false;
  state$1.progress = null;
  cancelRequested = false;
  render();
  try {
    const activeProfile = currentProfile();
    const rows = rawRowsFromSheets(state$1.sheets, activeProfile, state$1.sheetName);
    const catalog = await buildCatalog();
    const fromCatalog = catalogToNormalizeContext(catalog, WORK_ALIASES);
    const context = {
      ...normalizeContextOf({ ...form, profile: activeProfile }),
      works: fromCatalog.works,
      aliases: fromCatalog.aliases
    };
    const run = await analyzeAsync(rows, form, context, {
      chunkSize: 1e3,
      isCancelled: () => cancelRequested,
      onProgress: (progress) => {
        state$1.progress = { done: progress.done, total: progress.total, message: progress.message };
        render();
      }
    });
    state$1.analysis = run.result;
    state$1.workOptions = catalog.works.map((work) => ({ id: work.id, name: work.name, groupName: work.groupName || "—" }));
    state$1.canManageWorks = canManageWorks();
    state$1.autoMatched = autoMatchedWorks(run.result.rows, await listAliases());
    state$1.cancelled = run.cancelled;
    state$1.issuesTotal = run.result.issues.length;
    state$1.progress = null;
    state$1.note = run.cancelled ? `Разбор отменён: разобрано ${run.processed} строк из ${run.total}. Данные неполные — сохранять их в объект нельзя.` : `Разобрано строк: ${state$1.analysis.stats.rows} за ${(run.elapsedMs / 1e3).toFixed(1)} с.` + (fromCatalog.aliases.length > WORK_ALIASES.length ? ` Связок ПТО учтено: ${fromCatalog.aliases.length - WORK_ALIASES.length}.` : "");
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
  }
  state$1.busy = false;
  render();
}
async function runLink(raw) {
  var _a;
  const select = (_a = root()) == null ? void 0 : _a.querySelector(`select[data-pf-link-raw="${raw.replace(/"/g, '\\"')}"]`);
  const workId = (select == null ? void 0 : select.value) ?? "";
  if (!workId) {
    state$1.error = "Выберите вид работ из справочника";
    render();
    return;
  }
  state$1.busy = true;
  state$1.error = "";
  state$1.note = "";
  render();
  try {
    const saved = await saveAlias(raw, workId);
    if (!saved.ok) {
      state$1.error = saved.error ?? "Не удалось сохранить связку";
    } else {
      const work = state$1.workOptions.find((item) => item.id === workId);
      state$1.busy = false;
      await runParse();
      state$1.note = `Связка сохранена: «${raw}» → «${(work == null ? void 0 : work.name) ?? workId}». ${state$1.note}`.trim();
      render();
      return;
    }
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
  }
  state$1.busy = false;
  render();
}
async function runConfirm(items) {
  const active = items.filter((item) => item.raw && item.workId);
  if (active.length === 0) return;
  state$1.error = "";
  state$1.note = "";
  for (const item of active) {
    const saved = await saveAlias(item.raw, item.workId, "pto");
    if (!saved.ok) {
      state$1.error = saved.error ?? "Не удалось подтвердить связку";
      render();
      return;
    }
  }
  state$1.busy = false;
  await runParse();
  state$1.note = `Подтверждено связок: ${active.length}. Теперь это решение ПТО, а не совпадение программы.`;
  render();
}
async function runSave() {
  const analysis = state$1.analysis;
  if (!analysis || !state$1.objectId) return;
  state$1.busy = true;
  state$1.error = "";
  render();
  try {
    const result = await saveImport({
      objectId: state$1.objectId,
      filename: state$1.filename,
      profileId: currentForm().id,
      profileTitle: currentForm().title,
      rows: analysis.rows,
      stats: analysis.stats
    });
    state$1.note = `Сохранено позиций: ${result.saved}.`;
    await loadSaved();
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
  }
  state$1.busy = false;
  render();
}
async function runDelete(importId) {
  state$1.busy = true;
  state$1.error = "";
  render();
  try {
    const result = await deleteImport(importId);
    state$1.note = `Импорт удалён вместе с позициями: ${result.removedRows}.`;
    await loadSaved();
  } catch (error) {
    state$1.error = error instanceof Error ? error.message : String(error);
  }
  state$1.busy = false;
  render();
}
const TABS = [
  { id: "summary", label: "Сводка" },
  { id: "vor", label: "ВОР" },
  { id: "contours", label: "Контуры" },
  { id: "works", label: "Справочник" },
  { id: "schedule", label: "График" },
  { id: "foreman", label: "Прораб" },
  { id: "fact", label: "План / факт" }
];
const SECTION_TEXT = {
  summary: {
    title: "Сводка по объектам",
    text: "Состояние по всем видимым объектам: объёмы, план и факт, расхождения, что ждёт решения."
  },
  works: {
    title: "Справочник видов работ",
    text: "Виды работ и связки названий из форм: справочник компании, ведёт ПТО."
  },
  contours: {
    title: "Контуры объёмов",
    text: "Объёмы по РД, договору, предложению ПТО, утверждению РП и приёмке заказчиком. Незаполненный контур — это не ноль."
  },
  vor: {
    title: "Ведомость объёмов работ",
    text: "Здесь появится загрузка формы заказчика (XLSX), сопоставление работ и структуры объекта и сама ВОР по выбранному объекту."
  },
  schedule: {
    title: "График производства работ",
    text: "Расчёт по объёму, норме и составу бригады: календарь, загрузка людей и порядок работ. Считается от ВОР этого объекта."
  },
  foreman: {
    title: "Прораб",
    text: "Ввод факта выполнения по объекту с работой без сети: очередь отправки и подтверждение при появлении связи."
  },
  fact: {
    title: "План / факт",
    text: "Свод план-факт по этажам и видам работ с отклонениями. Строится на данных ВОР и введённого факта."
  }
};
const state = { objectId: "", tab: "vor" };
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mountPlanFactShell() {
  const shell = planFactServices().shell;
  const content = (shell && typeof shell.getContentRoot === "function" ? shell.getContentRoot() : null) || document.getElementById("app-content") || document.getElementById("app-root");
  if (!content) return;
  if (document.getElementById("tab-plan-fact")) return;
  const section = document.createElement("div");
  section.id = "tab-plan-fact";
  section.className = "view-section hidden";
  section.innerHTML = '<div class="p-3 sm:p-4"><div id="plan-fact-root"></div></div>';
  content.appendChild(section);
}
function headerHtml() {
  return `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0">
        <h2 class="text-rbi-title font-bold tracking-tight text-ink">План/Факт СМР</h2>
        <p class="text-rbi-caption text-muted mt-0.5">Ведомость объёмов работ, график и факт выполнения по объекту</p>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <button type="button" id="pf-export"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Выгрузить XLSX</button>
        <button type="button" id="pf-refresh"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Обновить</button>
      </div>
    </div>
    <div id="pf-export-note" class="mb-3"></div>
    <div id="pf-cloud-strip" class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Состояние облака проверяется…</span>
    </div>`;
}
function objectsHtml(objects) {
  if (!objects.length) {
    return `
      <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
        <div class="text-rbi-body font-bold text-ink">Объекты недоступны</div>
        <p class="text-rbi-caption text-muted mt-1">Объектная область вашей роли: ${escapeHtml(scopeLabel())}.
        Если объект должен быть виден — его назначает администратор компании в разделе «Доступ и роли».</p>
      </div>`;
  }
  const options = objects.map((object) => {
    const selected = object.id === state.objectId ? " selected" : "";
    return `<option value="${escapeHtml(object.id)}"${selected}>${escapeHtml(objectDisplayName(object))}</option>`;
  }).join("");
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2">
      <label class="text-rbi-label text-muted" for="pf-object-select">Объект</label>
      <select id="pf-object-select"
        class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 min-w-0 flex-1 sm:flex-none">
        ${options}
      </select>
      <span class="text-rbi-caption text-muted">${escapeHtml(scopeLabel())} · всего: ${objects.length}</span>
    </div>`;
}
const ROUTE_STEPS = [
  { key: "vor", title: "ВОР", tab: "vor" },
  { key: "contours", title: "Контуры", tab: "contours" },
  { key: "approval", title: "Утверждение", tab: "contours", anchor: "pf-approval" },
  { key: "reconcile", title: "Сверка", tab: "contours", anchor: "pf-reconcile" },
  { key: "summary", title: "Сводка", tab: "summary" }
];
function routeHtml() {
  const steps = ROUTE_STEPS.map((step, index2) => {
    const arrow = index2 ? '<span class="text-rbi-caption text-muted">→</span>' : "";
    return `${arrow}<button type="button" data-pf-route="${step.key}" data-pf-route-tab="${step.tab}"
      ${step.anchor ? `data-pf-route-anchor="${step.anchor}"` : ""}
      class="bg-surface border border-surface rounded-lg px-2 py-1 text-rbi-caption text-ink hover:border-brand transition-colors">
      <span class="text-muted">${index2 + 1}.</span> ${escapeHtml(step.title)}
      <span data-pf-route-value="${step.key}" class="text-muted">…</span></button>`;
  }).join("");
  return `<div id="pf-route" class="flex flex-wrap items-center gap-1.5 mb-3">${steps}</div>`;
}
async function refreshRoute() {
  const setValue = (key, value) => {
    const el = document.querySelector(`[data-pf-route-value="${key}"]`);
    if (el) el.textContent = value;
  };
  if (!state.objectId) {
    ["vor", "contours", "approval", "reconcile"].forEach((key) => setValue(key, "нет объекта"));
    return;
  }
  try {
    const rows = await listWorRows(state.objectId);
    setValue("vor", rows.length ? `${rows.length} позиций` : "нет ВОР");
    const contours = await listContours(state.objectId);
    const contourRows = buildContourRows(rows, contours);
    const completion = contourCompletion(contourRows);
    setValue(
      "contours",
      completion.complete > 0 ? `${completion.complete} из ${completion.total}` : completion.partial > 0 ? `${completion.partial} частично` : "не заполнено"
    );
    const proposals = await listProposals(state.objectId);
    const pending = proposals.filter((proposal) => proposal.status === "submitted").length;
    setValue("approval", pending > 0 ? `ждёт решения ${pending}` : proposals.length > 0 ? "решений нет" : "нет предложений");
    const rules = await loadThresholds(state.objectId);
    const summary = reconciliationSummary(reconcileRows(contourRows, rules));
    setValue("reconcile", summary.warnings > 0 ? `выше порога ${summary.warnings}` : "в пределах порога");
    setValue("summary", "открыть");
  } catch (_error) {
  }
}
function tabsHtml() {
  const buttons = TABS.map((tab) => {
    const active = tab.id === state.tab;
    const cls = active ? "text-brand border-brand" : "text-muted border-transparent";
    return `<button type="button" data-pf-tab="${tab.id}"
      class="px-3 py-1.5 text-rbi-body font-bold border-b-2 ${cls}">${escapeHtml(tab.label)}</button>`;
  }).join("");
  return `<div class="flex items-center gap-1 border-b border-surface mb-3 overflow-x-auto">${buttons}</div>`;
}
function emptyBodyHtml() {
  const section = SECTION_TEXT[state.tab];
  return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-body text-muted mt-3">${escapeHtml(section.text)}</p>
      <p class="text-rbi-caption text-danger mt-3">В модуле нет доступных вам объектов, поэтому показать нечего.
      Обратитесь к администратору: доступ к объектам выдаётся в настройках компании.</p>
    </div>`;
}
function bodyHtml(objects) {
  const section = SECTION_TEXT[state.tab];
  const object = objects.find((item) => item.id === state.objectId) || null;
  const objectLine = object ? `Объект: ${escapeHtml(objectDisplayName(object))}` : "Объект не выбран";
  if (state.tab === "foreman" || state.tab === "fact") {
    const rootId = state.tab === "foreman" ? "pf-foreman-root" : "pf-planfact-root";
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="${rootId}" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }
  if (state.tab === "summary") {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">Только для чтения: сводка ничего не меняет.</p>
      <div id="pf-dashboard-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Собираю сводку…</div>
      </div>
    </div>`;
  }
  if (state.tab === "works") {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">Справочник компании: правка влияет на все объекты.</p>
      <div id="pf-works-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }
  if (state.tab === "contours") {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-contours-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }
  if (state.tab === "schedule") {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-schedule-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }
  if (state.tab === "vor") {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-vor-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }
  return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <p class="text-rbi-body text-muted mt-3">${escapeHtml(section.text)}</p>
      <p class="text-rbi-caption text-muted mt-3">Раздел в разработке: данных пока нет, заглушек вместо объёмов
      и факта модуль не показывает.</p>
    </div>`;
}
function bind(root2) {
  const select = root2.querySelector("#pf-object-select");
  if (select) {
    select.addEventListener("change", () => {
      state.objectId = select.value;
      renderPlanFact();
    });
  }
  root2.querySelectorAll("[data-pf-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-pf-route-tab");
      if (!tab) return;
      const anchor = button.getAttribute("data-pf-route-anchor");
      const target = tab;
      state.tab = target;
      renderPlanFact();
      if (_sectionNavigator) _sectionNavigator(target);
      if (anchor) {
        setTimeout(() => {
          var _a;
          return (_a = document.getElementById(anchor)) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
    });
  });
  root2.querySelectorAll("[data-pf-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-pf-tab");
      if (tab === "summary" || tab === "vor" || tab === "contours" || tab === "works" || tab === "schedule" || tab === "foreman" || tab === "fact") {
        state.tab = tab;
        renderPlanFact();
        if (_sectionNavigator) _sectionNavigator(tab);
      }
    });
  });
  const exportButton = root2.querySelector("#pf-export");
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      void runExport();
    });
  }
  const refresh = root2.querySelector("#pf-refresh");
  if (refresh) {
    refresh.addEventListener("click", () => {
      refresh.disabled = true;
      rebuildObjects().then(() => renderPlanFact()).catch(() => renderPlanFact()).then(() => {
        refresh.disabled = false;
      });
    });
  }
}
function _cloudTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
async function refreshCloudStrip() {
  var _a;
  const strip = document.getElementById("pf-cloud-strip");
  if (!strip) return;
  let state2;
  try {
    state2 = await planFactQueue();
  } catch (_error) {
    strip.innerHTML = '<span class="text-rbi-caption text-danger">Облако недоступно: очередь остаётся на устройстве.</span>';
    return;
  }
  if (!state2.enabled) {
    strip.innerHTML = `<span class="text-rbi-caption text-muted">Облако не подключено: синхронизация с проектом не настроена,
      данные хранятся на устройстве.</span>`;
    return;
  }
  const last = state2.lastResult;
  const lastLine = last ? last.skipped ? `последняя попытка: отложена (${last.skipped === "offline" ? "нет сети" : last.skipped === "no-session" ? "нет сессии" : "синк выключен"})` : `последняя синхронизация: ${_cloudTime(last.at)} · отправлено ${last.pushed}, получено ${last.pulled}${last.failed ? `, ошибок ${last.failed}` : ""}` : "синхронизация ещё не запускалась";
  strip.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-rbi-body text-ink">В очереди: <span class="font-bold">${state2.pending}</span></span>
      <span class="text-rbi-caption text-muted">${lastLine}</span>
      <button type="button" id="pf-cloud-sync"
        class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Синхронизировать</button>
      ${state2.pending > 0 ? '<span class="text-rbi-caption text-danger">есть несохранённое в облаке</span>' : ""}
    </div>`;
  (_a = strip.querySelector("#pf-cloud-sync")) == null ? void 0 : _a.addEventListener("click", () => {
    void runCloudSync();
  });
}
function _exportNote(html) {
  const note = document.getElementById("pf-export-note");
  if (note) note.innerHTML = html;
}
async function runExport() {
  const objects = listVisibleObjects();
  const object = objects.find((item) => item.id === state.objectId) || null;
  if (!object) {
    _exportNote('<span class="text-rbi-caption text-danger">Сначала выберите объект: выгружать нечего.</span>');
    return;
  }
  _exportNote('<span class="text-rbi-caption text-muted">Готовим выгрузку…</span>');
  try {
    const worRows = await listWorRows(state.objectId);
    if (worRows.length === 0) {
      _exportNote('<span class="text-rbi-caption text-danger">В этом объекте нет сохранённой ВОР: сначала разберите форму заказчика в разделе «ВОР».</span>');
      return;
    }
    const factRows = await listFacts(state.objectId);
    const result = buildWorExport({ objectName: objectDisplayName(object), worRows, factRows });
    const written = writeWorWorkbook(result);
    window.__PF_LAST_EXPORT = {
      filename: result.filename,
      sheets: result.sheets.map((sheet) => sheet.name),
      stats: result.stats,
      ok: written.ok,
      error: written.error ?? null
    };
    _exportNote(written.ok ? `<span class="text-rbi-caption text-brand">${escapeHtml(formatExportSummary(result))}</span>` : `<span class="text-rbi-caption text-danger">Выгрузка не прошла: ${escapeHtml(String(written.error))}</span>`);
  } catch (error) {
    _exportNote(`<span class="text-rbi-caption text-danger">Выгрузка не прошла: ${escapeHtml(error instanceof Error ? error.message : String(error))}</span>`);
  }
}
async function runCloudSync() {
  const strip = document.getElementById("pf-cloud-strip");
  if (strip) {
    strip.innerHTML = '<span class="text-rbi-caption text-muted">Синхронизация…</span>';
  }
  const result = await syncPlanFact();
  renderPlanFact();
  if (result.error) {
    const current = document.getElementById("pf-cloud-strip");
    if (current) {
      current.innerHTML = `<span class="text-rbi-caption text-danger">Синхронизация не прошла: ${escapeHtml(result.error)}</span>`;
    }
  }
}
function setPlanFactTab(tab) {
  state.tab = tab;
  renderPlanFact();
}
function getPlanFactTab() {
  return state.tab;
}
let _sectionNavigator = null;
function setSectionNavigator(navigator2) {
  _sectionNavigator = navigator2;
}
function renderPlanFact() {
  const root2 = document.getElementById("plan-fact-root");
  if (!root2) return;
  const objects = listVisibleObjects();
  if (state.objectId && !objects.some((item) => item.id === state.objectId)) state.objectId = "";
  if (!state.objectId && objects.length) state.objectId = objects[0].id;
  const objectFreeSection = state.tab === "works" || state.tab === "summary";
  root2.innerHTML = headerHtml() + objectsHtml(objects) + tabsHtml() + ((objects.length || objectFreeSection) && !objectFreeSection ? routeHtml() : "") + (objects.length || objectFreeSection ? bodyHtml(objects) : emptyBodyHtml());
  bind(root2);
  if (objects.length && !objectFreeSection) void refreshRoute();
  if (state.tab === "works") void mountWorksPanel();
  if (state.tab === "summary") void mountDashboardPanel();
  if (!objects.length) return;
  if (state.tab === "vor") void mountVorPanel(state.objectId);
  if (state.tab === "schedule") void mountSchedulePanel(state.objectId);
  if (state.tab === "contours") void mountContoursPanel(state.objectId);
  if (state.tab === "foreman") void mountForemanPanel(state.objectId);
  if (state.tab === "fact") void mountPlanFactPanel(state.objectId);
  void refreshCloudStrip();
}
let _inited = false;
const TAB_IDS = ["summary", "vor", "contours", "works", "schedule", "foreman", "fact"];
function _hashPath() {
  return String(window.location.hash || "").replace(/^#/, "");
}
function _applyHashTab() {
  const path = _hashPath();
  if (!path.startsWith("/plan-fact/")) return;
  const sub = path.slice("/plan-fact/".length).split("/")[0];
  if (TAB_IDS.indexOf(sub) !== -1) setPlanFactTab(sub);
}
function _modeManager() {
  return window.AppModeManager;
}
function _ensureMode() {
  const modeMgr = _modeManager();
  if (!modeMgr || !modeMgr.currentMode) return true;
  if (modeMgr.currentMode === "plan-fact") return true;
  if (typeof modeMgr.changeMode === "function") {
    modeMgr.changeMode("plan-fact");
    return false;
  }
  return true;
}
function showTab() {
  document.querySelectorAll(".view-section").forEach((el) => {
    el.classList.remove("active");
  });
  const tab = document.getElementById("tab-plan-fact");
  if (tab) {
    tab.classList.remove("hidden");
    tab.classList.add("active");
  }
  const modeMgr = _modeManager();
  if (modeMgr && typeof modeMgr.updateHeaderVisibility === "function") {
    modeMgr.updateHeaderVisibility(true);
  }
  if (modeMgr && modeMgr.currentMode === "plan-fact" && typeof modeMgr.renderBottomNav === "function") {
    modeMgr.renderBottomNav();
  }
  renderPlanFact();
  if (typeof window.updateBodyPadding === "function") {
    setTimeout(() => {
      var _a;
      return (_a = window.updateBodyPadding) == null ? void 0 : _a.call(window);
    }, 50);
  }
}
function _openModule() {
  _applyHashTab();
  if (_ensureMode()) {
    _syncHashWithTab();
    showTab();
  }
}
function _syncHashWithTab() {
  if (_hashPath() !== "/plan-fact") return;
  const target = `#/plan-fact/${getPlanFactTab()}`;
  const router = window.AppRouter;
  if (window.location.hash === target) return;
  if (router && typeof router.navigate === "function") router.navigate(target, true);
  else window.location.hash = target;
}
function _wireSectionNavigator() {
  setSectionNavigator((tab) => {
    const target = `#/plan-fact/${tab}`;
    if (window.location.hash === target) return;
    const router = window.AppRouter;
    if (router && typeof router.navigate === "function") router.navigate(target);
    else window.location.hash = target;
  });
}
function _registerAppRouter() {
  const router = window.AppRouter;
  if (router && typeof router.addRoute === "function") {
    router.addRoute("#/plan-fact", _openModule);
    TAB_IDS.forEach((id) => {
      if (router.addRoute) router.addRoute(`#/plan-fact/${id}`, _openModule);
    });
  }
  const _followRoute = () => {
    if (_hashPath().startsWith("/plan-fact")) _openModule();
  };
  window.addEventListener("hashchange", _followRoute);
  window.addEventListener("popstate", _followRoute);
  if (_hashPath().startsWith("/plan-fact")) {
    setTimeout(_openModule, 0);
  }
}
async function init(_ctx) {
  var _a, _b, _c;
  if (_inited) {
    _applyHashTab();
    _openModule();
    return { ok: true, reentered: true };
  }
  mountPlanFactShell();
  _applyHashTab();
  renderPlanFact();
  _wireSectionNavigator();
  (_c = (_b = (_a = window.RBI) == null ? void 0 : _a.events) == null ? void 0 : _b.on) == null ? void 0 : _c.call(_b, "locations:changed", () => {
    const tab = document.getElementById("tab-plan-fact");
    if (tab && !tab.classList.contains("hidden")) renderPlanFact();
  });
  _registerAppRouter();
  initPlanFactCloud();
  if (_hashPath().startsWith("/plan-fact")) _openModule();
  _inited = true;
  console.info("[plan-fact] init ok");
  return { ok: true };
}
function registerModule() {
  var _a;
  window.RBI = window.RBI || { services: {} };
  const mod = { init, showTab, manifest: PlanFactManifest, render: renderPlanFact };
  if ((_a = window.RBI.registry) == null ? void 0 : _a.register) {
    window.RBI.registry.register("module.plan-fact", mod);
  }
  window.PlanFactModule = mod;
}
registerModule();
const index = { init, showTab, manifest: PlanFactManifest };
export {
  PlanFactManifest,
  index as default,
  init,
  showTab
};
//# sourceMappingURL=plan-fact.js.map
