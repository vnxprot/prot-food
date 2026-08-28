import type { Restaurant } from "./types";

export type ReportRow = {
  name: string;
  note: string;
  address: string;
  ward: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  locationStatus: string;
  reviewReason: string;
};

export type LocationReport = {
  total: number;
  verified: ReportRow[];
  ambiguous: ReportRow[];
};

const toRow = (restaurant: Restaurant): ReportRow => {
  const verified = restaurant.geocode_confidence === "manual";
  const hasAddress = Boolean(restaurant.address_raw?.trim());
  return {
    name: restaurant.name,
    note: restaurant.shop_note || "",
    address: restaurant.address_raw || "(trống)",
    ward: restaurant.admin_wards?.name || "",
    category: restaurant.category || "Khác",
    latitude: restaurant.lat,
    longitude: restaurant.lng,
    locationStatus: verified ? "Đã đối chiếu đúng" : "Mơ hồ / cần review",
    reviewReason: verified
      ? "Đã kiểm chứng bằng POI Google Maps."
      : !hasAddress
        ? "Thiếu địa chỉ, chưa thể ghim vị trí."
        : restaurant.lat == null || restaurant.lng == null
          ? "Chưa có tọa độ; cần bổ sung hoặc ghim tay."
          : "Tọa độ Nominatim tự động chưa được kiểm chứng.",
  };
};

export function makeLocationReport(restaurants: Restaurant[]): LocationReport {
  const rows = restaurants.map(toRow);
  return { total: rows.length, verified: rows.filter((row) => row.locationStatus === "Đã đối chiếu đúng"), ambiguous: rows.filter((row) => row.locationStatus !== "Đã đối chiếu đúng") };
}

const csvEscape = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const tableHeaders = ["Tên quán", "Ghi chú", "Địa chỉ", "Phường/xã", "Nhóm món", "Latitude", "Longitude", "Trạng thái vị trí", "Lý do / ghi chú"];
const tableValues = (row: ReportRow) => [row.name, row.note, row.address, row.ward, row.category, row.latitude, row.longitude, row.locationStatus, row.reviewReason];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(report: LocationReport) {
  const sections = [
    ["PROT FOOD · BÁO CÁO VỊ TRÍ"],
    ["Tổng số", report.total], ["Đã đối chiếu", report.verified.length], ["Mơ hồ / cần review", report.ambiguous.length], [],
    ["ĐÃ ĐỐI CHIẾU"], tableHeaders, ...report.verified.map(tableValues), [],
    ["MƠ HỒ CẦN REVIEW"], tableHeaders, ...report.ambiguous.map(tableValues),
  ];
  const csv = `\uFEFF${sections.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "prot-food-bao-cao-vi-tri.csv");
}

export async function downloadExcel(report: LocationReport) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const overview = XLSX.utils.aoa_to_sheet([["PROT FOOD · BÁO CÁO VỊ TRÍ"], [], ["Chỉ tiêu", "Số lượng"], ["Tổng số", report.total], ["Đã đối chiếu", report.verified.length], ["Mơ hồ / cần review", report.ambiguous.length]]);
  const toSheet = (rows: ReportRow[]) => XLSX.utils.aoa_to_sheet([tableHeaders, ...rows.map(tableValues)]);
  XLSX.utils.book_append_sheet(workbook, overview, "Tổng quan");
  XLSX.utils.book_append_sheet(workbook, toSheet(report.verified), "Đã đối chiếu");
  XLSX.utils.book_append_sheet(workbook, toSheet(report.ambiguous), "Mơ hồ cần review");
  XLSX.writeFile(workbook, "prot-food-bao-cao-vi-tri.xlsx", { compression: true });
}

export async function downloadPdf(report: LocationReport) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 16;
  const write = (text: string, size = 9, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 265);
    if (y + lines.length * 5 > 196) { pdf.addPage(); y = 16; }
    pdf.text(lines, 16, y); y += lines.length * 5 + 1;
  };
  write("PROT FOOD — BÁO CÁO VỊ TRÍ", 16, true);
  write(`Tổng số: ${report.total}  |  Đã đối chiếu: ${report.verified.length}  |  Mơ hồ / cần review: ${report.ambiguous.length}`, 10);
  y += 3; write("ĐÃ ĐỐI CHIẾU", 12, true);
  report.verified.forEach((row) => write(`• ${row.name} — ${row.address} (${row.latitude?.toFixed(6)}, ${row.longitude?.toFixed(6)})`));
  y += 3; write("MƠ HỒ CẦN REVIEW", 12, true);
  report.ambiguous.forEach((row) => write(`• ${row.name} — ${row.address}. ${row.reviewReason}`));
  pdf.save("prot-food-bao-cao-vi-tri.pdf");
}
