/**
 * Asset & License Tracker - Client-side Logic & State Management
 * Faithfully mirrors Python CLI logic (storage, validation, state transitions)
 * Zero server-side dependencies, pure HTML5 LocalStorage persistence.
 */

// Initial Default Dataset identical to Python storage.py DEFAULT_DATA
const DEFAULT_DATA = [
  {
    id: "A101",
    name: "MacBook Pro 16",
    type: "hardware",
    status: "available",
    assigned_to: null,
    expiry_date: null
  },
  {
    id: "A102",
    name: "Dell XPS 15",
    type: "hardware",
    status: "borrowed",
    assigned_to: "Dan Cohen",
    expiry_date: null
  },
  {
    id: "L201",
    name: "JetBrains All Products Pack",
    type: "license",
    status: "available",
    assigned_to: null,
    expiry_date: "2024-12-31" // Expired
  },
  {
    id: "L202",
    name: "Slack Enterprise Grid",
    type: "license",
    status: "assigned",
    assigned_to: "Sarah Levy",
    expiry_date: "2027-06-30"
  },
  {
    id: "A103",
    name: "Logitech MX Master 3S",
    type: "hardware",
    status: "available",
    assigned_to: null,
    expiry_date: null
  }
];

const STORAGE_KEY = "asset_tracker_data_v1";

// -------------------------------------------------------------
// Storage Layer (Local Persistence & Recovery)
// -------------------------------------------------------------
function loadAssets() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    saveAssets(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    console.warn("Storage corrupted, fallback to defaults.");
    saveAssets(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  } catch (e) {
    console.error("Failed to parse localStorage data:", e);
    saveAssets(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveAssets(assets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
    return true;
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
    return false;
  }
}

// -------------------------------------------------------------
// Business Logic Layer (Mirrors logic.py)
// -------------------------------------------------------------
class AssetManager {
  constructor() {
    this.assets = loadAssets();
  }

  refresh() {
    this.assets = loadAssets();
  }

  getAll() {
    return this.assets;
  }

  findById(assetId) {
    if (!assetId) return null;
    const cleanId = String(assetId).trim().toUpperCase();
    return this.assets.find(item => String(item.id).trim().toUpperCase() === cleanId) || null;
  }

  assignOrBorrow(assetId, employeeName) {
    const cleanId = (assetId || "").trim();
    const cleanEmp = (employeeName || "").trim();

    if (!cleanId) {
      return { success: false, message: "מזהה פריט (ID) לא יכול להיות ריק." };
    }
    if (!cleanEmp) {
      return { success: false, message: "שם עובד לא יכול להיות ריק או להכיל רווחים בלבד." };
    }

    const asset = this.findById(cleanId);
    if (!asset) {
      return { success: false, message: `פריט בעל מזהה '${cleanId}' לא נמצא במערכת.` };
    }

    const currentStatus = (asset.status || "").toLowerCase();
    if (currentStatus !== "available" && currentStatus !== "פנוי") {
      const assignedTo = asset.assigned_to || "מישהו אחר";
      return { 
        success: false, 
        message: `הפריט '${asset.name}' אינו פנוי (סטטוס נוכחי: ${currentStatus}, משויך ל: ${assignedTo}).` 
      };
    }

    // Check expiry date for licenses (Bug Fix 01 logic)
    const isLicense = (asset.type || "").toLowerCase() === "license";
    if (isLicense && asset.expiry_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expDate = new Date(asset.expiry_date);
      if (expDate < today) {
        return {
          success: false,
          message: `לא ניתן לשייך את הרישיון '${asset.name}' מכיוון שתוקפו פג בתאריך ${asset.expiry_date}.`
        };
      }
    }

    const newStatus = isLicense ? "assigned" : "borrowed";
    asset.status = newStatus;
    asset.assigned_to = cleanEmp;

    if (saveAssets(this.assets)) {
      const actionDesc = isLicense ? "שויך בהצלחה" : "הושאל בהצלחה";
      return {
        success: true,
        message: `הפריט '${asset.name}' (ID: ${asset.id}) ${actionDesc} לעובד ${cleanEmp}.`
      };
    } else {
      return { success: false, message: "שגיאה בשמירת הנתונים בזיכרון המקומי." };
    }
  }

  returnAsset(assetId) {
    const cleanId = (assetId || "").trim();
    if (!cleanId) {
      return { success: false, message: "מזהה פריט (ID) לא יכול להיות ריק." };
    }

    const asset = this.findById(cleanId);
    if (!asset) {
      return { success: false, message: `פריט בעל מזהה '${cleanId}' לא נמצא במערכת.` };
    }

    const currentStatus = (asset.status || "").toLowerCase();
    if (currentStatus === "available" || currentStatus === "פנוי") {
      return {
        success: false,
        message: `הפריט '${asset.name}' כבר במצב פנוי (אינו מושאל או משויך).`
      };
    }

    const previousOwner = asset.assigned_to || "לא ידוע";
    asset.status = "available";
    asset.assigned_to = null;

    if (saveAssets(this.assets)) {
      return {
        success: true,
        message: `הפריט '${asset.name}' (ID: ${asset.id}) הוחזר בהצלחה (שוחרר מ: ${previousOwner}).`
      };
    } else {
      return { success: false, message: "שגיאה בעדכון הנתונים." };
    }
  }

  generateReportText() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFormatted = new Date().toLocaleString("he-IL");

    const borrowedOrAssigned = [];
    const expiredAssets = [];

    this.assets.forEach(item => {
      const status = (item.status || "").toLowerCase();
      if (status === "borrowed" || status === "assigned") {
        borrowedOrAssigned.push(item);
      }
      if (item.expiry_date) {
        const exp = new Date(item.expiry_date);
        if (exp < today) {
          expiredAssets.push(item);
        }
      }
    });

    const lines = [
      "============================================================",
      "          דוח פריטים מושאלים / רישיונות פגי תוקף          ",
      `תאריך הפקה: ${dateFormatted}`,
      "============================================================",
      "",
      "--- [1] ציוד מושאל / רישיונות משויכים (ציוד שאינו פנוי) ---"
    ];

    if (borrowedOrAssigned.length === 0) {
      lines.push("אין כרגע ציוד מושאל או משויך (הכל זמין במלאי).");
    } else {
      borrowedOrAssigned.forEach(item => {
        lines.push(`• ID: ${item.id} | שם: ${item.name} | סוג: ${item.type} | מושאל ל: ${item.assigned_to}`);
      });
    }

    lines.push("", "--- [2] רישיונות / פריטים שפג תוקפם ---");

    if (expiredAssets.length === 0) {
      lines.push("אין פריטים או רישיונות שפג תוקפם.");
    } else {
      expiredAssets.forEach(item => {
        lines.push(`• ID: ${item.id} | שם: ${item.name} | פג תוקף ב: ${item.expiry_date} | סטטוס: ${item.status}`);
      });
    }

    lines.push(
      "",
      "============================================================",
      `סה"כ ציוד מושאל/משויך: ${borrowedOrAssigned.length}`,
      `סה"כ רישיונות שפג תוקפם: ${expiredAssets.length}`,
      "סוף דוח"
    );

    return {
      text: lines.join("\n"),
      borrowedCount: borrowedOrAssigned.length,
      expiredCount: expiredAssets.length
    };
  }
}

// -------------------------------------------------------------
// UI & Presentation Controller
// -------------------------------------------------------------
const manager = new AssetManager();

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  renderAssetsTable();
  updateStats();
  initAssignForm();
  initReturnForm();
  initExportSection();
  initGlobalActions();
});

// Toast Notifications
function showToast(message, isSuccess = true) {
  const toast = document.getElementById("toast-message");
  toast.textContent = message;
  toast.className = `toast ${isSuccess ? "toast-success" : "toast-error"}`;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 4500);
}

// Navigation Tabs
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      // Auto refresh views when switching
      if (targetId === "tab-list") renderAssetsTable();
      if (targetId === "tab-return") renderReturnQuickChips();
      if (targetId === "tab-report") updateReportPreview();
    });
  });
}

// Stats Calculation
function updateStats() {
  const assets = manager.getAll();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let availableCount = 0;
  let borrowedCount = 0;
  let expiredCount = 0;

  assets.forEach(a => {
    const s = (a.status || "").toLowerCase();
    if (s === "available" || s === "פנוי") availableCount++;
    if (s === "borrowed" || s === "assigned") borrowedCount++;
    if (a.expiry_date && new Date(a.expiry_date) < today) expiredCount++;
  });

  document.getElementById("stat-total").textContent = assets.length;
  document.getElementById("stat-available").textContent = availableCount;
  document.getElementById("stat-borrowed").textContent = borrowedCount;
  document.getElementById("stat-expired").textContent = expiredCount;
}

// Table Rendering & Filters
function renderAssetsTable() {
  const tbody = document.getElementById("assets-tbody");
  const searchTerm = (document.getElementById("search-input").value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("status-filter").value;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assets = manager.getAll().filter(item => {
    const matchesSearch = 
      item.id.toLowerCase().includes(searchTerm) ||
      item.name.toLowerCase().includes(searchTerm) ||
      (item.assigned_to && item.assigned_to.toLowerCase().includes(searchTerm));

    const matchesStatus = 
      statusFilter === "all" ||
      item.status.toLowerCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  tbody.innerHTML = "";

  if (assets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-muted);">לא נמצאו פריטים תואמים.</td></tr>`;
    return;
  }

  assets.forEach(item => {
    const tr = document.createElement("tr");

    const statusMap = {
      available: { text: "פנוי (Available)", cls: "status-available" },
      borrowed: { text: "מושאל (Borrowed)", cls: "status-borrowed" },
      assigned: { text: "משויך (Assigned)", cls: "status-assigned" }
    };
    const currentStatus = statusMap[item.status.toLowerCase()] || { text: item.status, cls: "" };

    const isExpired = item.expiry_date && new Date(item.expiry_date) < today;
    const expiryDisplay = item.expiry_date 
      ? `${item.expiry_date} ${isExpired ? '<span class="tag-expired">[פג תוקף]</span>' : ''}`
      : "-";

    const isAvailable = (item.status || "").toLowerCase() === "available";

    tr.innerHTML = `
      <td><span class="asset-id-badge">${item.id}</span></td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${item.type === "hardware" ? "חומרה" : "רישיון"}</td>
      <td><span class="status-badge ${currentStatus.cls}">${currentStatus.text}</span></td>
      <td>${item.assigned_to ? escapeHtml(item.assigned_to) : '<span style="color:var(--text-muted);">-</span>'}</td>
      <td>${expiryDisplay}</td>
      <td>
        ${isAvailable 
          ? `<button class="btn-table-action" onclick="quickFillAssign('${item.id}')">השאל/שייך</button>` 
          : `<button class="btn-table-action" onclick="quickFillReturn('${item.id}')">החזר ציוד</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Assign / Borrow Handler
function initAssignForm() {
  const form = document.getElementById("assign-form");
  const idInput = document.getElementById("assign-asset-id");
  const quickBtn = document.getElementById("btn-quick-select");
  const dropdown = document.getElementById("quick-select-dropdown");

  quickBtn.addEventListener("click", () => {
    const availableItems = manager.getAll().filter(i => (i.status || "").toLowerCase() === "available");
    if (dropdown.classList.contains("hidden")) {
      dropdown.innerHTML = "";
      if (availableItems.length === 0) {
        dropdown.innerHTML = `<div class="dropdown-item" style="color:var(--text-muted)">אין פריטים פנויים כעת</div>`;
      } else {
        availableItems.forEach(item => {
          const div = document.createElement("div");
          div.className = "dropdown-item";
          div.innerHTML = `<span><strong>${item.id}</strong> - ${item.name}</span> <small>${item.type}</small>`;
          div.onclick = () => {
            idInput.value = item.id;
            dropdown.classList.add("hidden");
          };
          dropdown.appendChild(div);
        });
      }
      dropdown.classList.remove("hidden");
    } else {
      dropdown.classList.add("hidden");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const assetId = idInput.value;
    const employee = document.getElementById("assign-employee-name").value;

    const res = manager.assignOrBorrow(assetId, employee);
    showToast(res.message, res.success);

    if (res.success) {
      form.reset();
      dropdown.classList.add("hidden");
      renderAssetsTable();
      updateStats();
    }
  });
}

// Return Asset Handler
function initReturnForm() {
  const form = document.getElementById("return-form");
  const returnInput = document.getElementById("return-asset-id");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const assetId = returnInput.value;

    const res = manager.returnAsset(assetId);
    showToast(res.message, res.success);

    if (res.success) {
      form.reset();
      renderAssetsTable();
      renderReturnQuickChips();
      updateStats();
    }
  });

  renderReturnQuickChips();
}

function renderReturnQuickChips() {
  const container = document.getElementById("borrowed-items-chips");
  const inUse = manager.getAll().filter(i => {
    const s = (i.status || "").toLowerCase();
    return s === "borrowed" || s === "assigned";
  });

  container.innerHTML = "";
  if (inUse.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted)">אין כרגע פריטים מושאלים או משויכים.</span>`;
    return;
  }

  inUse.forEach(item => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-item";
    chip.innerHTML = `<strong>${item.id}</strong>: ${escapeHtml(item.name)} (אצל: ${escapeHtml(item.assigned_to)})`;
    chip.onclick = () => {
      document.getElementById("return-asset-id").value = item.id;
    };
    container.appendChild(chip);
  });
}

// Report Generation & Download (TXT File)
function initExportSection() {
  const btnDownload = document.getElementById("btn-download-report");
  const btnPreview = document.getElementById("btn-generate-preview");

  btnPreview.addEventListener("click", updateReportPreview);

  btnDownload.addEventListener("click", () => {
    const reportData = manager.generateReportText();
    let filename = (document.getElementById("report-filename").value || "report.txt").trim();
    if (!filename.endsWith(".txt")) filename += ".txt";

    // Create client-side file download Blob
    const blob = new Blob([reportData.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`הדוח הורד בהצלחה לקובץ: ${filename}`, true);
  });

  updateReportPreview();
}

function updateReportPreview() {
  const reportData = manager.generateReportText();
  document.getElementById("report-preview-text").textContent = reportData.text;
}

// Global Actions & Quick Fillers
function initGlobalActions() {
  document.getElementById("search-input").addEventListener("input", renderAssetsTable);
  document.getElementById("status-filter").addEventListener("change", renderAssetsTable);

  document.getElementById("btn-reset-data").addEventListener("click", () => {
    if (confirm("האם אתה בטוח שברצונך לאפס את הנתונים לערכי ברירת המחדל המקוריים?")) {
      saveAssets(DEFAULT_DATA);
      manager.refresh();
      renderAssetsTable();
      renderReturnQuickChips();
      updateStats();
      updateReportPreview();
      showToast("הנתונים אופסו בהצלחה לברירת המחדל.", true);
    }
  });
}

// Helpers for quick table button actions
window.quickFillAssign = function(id) {
  const tabAssignBtn = document.querySelector('[data-tab="tab-assign"]');
  tabAssignBtn.click();
  document.getElementById("assign-asset-id").value = id;
  document.getElementById("assign-employee-name").focus();
};

window.quickFillReturn = function(id) {
  const tabReturnBtn = document.querySelector('[data-tab="tab-return"]');
  tabReturnBtn.click();
  document.getElementById("return-asset-id").value = id;
};

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

