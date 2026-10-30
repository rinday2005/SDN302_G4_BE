import { REGIONS, SHIPPING_RATES } from "./regionData.js";

const cleanProvinceName = (raw) => {
  if (!raw || typeof raw !== "string") return "";
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/^(thành phố|tp\.?|tỉnh)\s+/i, "")
    .replace(/,\s*(việt nam|vietnam)$/i, "")
    .trim();

  if (
    s === "hcm" ||
    s === "tphcm" ||
    s === "tp.hcm" ||
    s === "tp hồ chí minh" ||
    s === "ho chi minh" ||
    s === "ho chi minh city" ||
    s === "sài gòn" ||
    s === "sai gon" ||
    s.includes("hồ chí minh") ||
    s.includes("ho chi minh") ||
    s.includes("sài gòn") ||
    s.includes("sai gon")
  ) {
    return "hồ chí minh";
  }
  if (s === "da nang" || s === "danang" || s.includes("đà nẵng") || s.includes("da nang")) {
    return "đà nẵng";
  }
  if (s === "ha noi" || s === "hanoi" || s.includes("hà nội") || s.includes("ha noi")) {
    return "hà nội";
  }
  if (s === "thừa thiên huế" || s === "thừa thiên - huế" || s === "hue" || s.includes("huế")) {
    return "huế";
  }
  if (s === "can tho" || s.includes("cần thơ")) {
    return "cần thơ";
  }
  if (s === "hai phong" || s.includes("hải phòng")) {
    return "hải phòng";
  }

  // Match if string contains one of the known provinces (e.g., full address string passed in)
  for (const provinces of Object.values(REGIONS)) {
    for (const p of provinces) {
      const pLower = p.trim().toLowerCase();
      if (s === pLower || s.includes(pLower)) {
        return pLower;
      }
    }
  }

  return s;
};

const getRegion = (province) => {
  const normalized = cleanProvinceName(province);
  if (!normalized) return null;

  for (const [region, provinces] of Object.entries(REGIONS)) {
    if (provinces.some((p) => cleanProvinceName(p) === normalized)) {
      return region;
    }
  }
  return null;
};

/**
 * Tính phí shipping theo khu vực giữa shop và người dùng
 * @param {string} shopProvince - Tỉnh/Thành của shop
 * @param {string} userProvince - Tỉnh/Thành của người dùng
 * @returns {number} Phí vận chuyển (VND)
 */
export const calculateShippingFee = (shopProvince, userProvince) => {
  if (!shopProvince || !userProvince || !String(shopProvince).trim() || !String(userProvince).trim()) {
    throw new Error("Vui lòng cung cấp đầy đủ thông tin tỉnh/thành phố");
  }

  const shopRegion = getRegion(shopProvince);
  const userRegion = getRegion(userProvince);

  if (!shopRegion || !userRegion) {
    throw new Error("Tỉnh/thành phố không hợp lệ hoặc chưa được hỗ trợ");
  }

  if (cleanProvinceName(shopProvince) === cleanProvinceName(userProvince)) {
    return SHIPPING_RATES.LOCAL;
  }

  if (shopRegion === userRegion) {
    return SHIPPING_RATES.REGIONAL;
  }

  return SHIPPING_RATES.INTER_REGION;
};

export const SHOP_BRANCHES = ["Đà Nẵng", "Hà Nội", "TP. Hồ Chí Minh"];

export const normalizeShopBranch = (rawLocation) => {
  if (!rawLocation || typeof rawLocation !== "string") return "Đà Nẵng";
  const lower = rawLocation.trim().toLowerCase();
  if (lower.includes("hà nội") || lower.includes("ha noi") || lower === "hn") {
    return "Hà Nội";
  }
  if (
    lower.includes("hồ chí minh") ||
    lower.includes("ho chi minh") ||
    lower.includes("hcm") ||
    lower.includes("sài gòn") ||
    lower.includes("sai gon")
  ) {
    return "TP. Hồ Chí Minh";
  }
  if (lower.includes("đà nẵng") || lower.includes("da nang") || lower === "dn") {
    return "Đà Nẵng";
  }
  const region = getRegion(rawLocation);
  if (region === "NORTH") return "Hà Nội";
  if (region === "SOUTH") return "TP. Hồ Chí Minh";
  return "Đà Nẵng";
};

export { cleanProvinceName, getRegion };
export default calculateShippingFee;
