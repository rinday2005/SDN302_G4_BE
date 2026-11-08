import crypto from "crypto";

/**
 * Định dạng ngày giờ theo chuẩn VNPay (YYYYMMDDHHmmss, chuẩn GMT+7 Asia/Ho_Chi_Minh)
 */
export const formatVnPayDate = (date = new Date()) => {
  const targetDate = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(targetDate);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`;
};

/**
 * Sắp xếp các tham số alphabet theo key và format theo chuẩn VNPay
 */
export const buildVnPaySignData = (params = {}) => {
  const sortedKeys = Object.keys(params).sort();
  const signParts = [];

  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== "") {
      signParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val).replace(/%20/g, "+")}`);
    }
  }

  return signParts.join("&");
};

/**
 * Tạo chữ ký HMAC-SHA512
 */
export const createVnPaySignature = (signData, hashSecret) => {
  const cleanSecret = String(hashSecret || "").trim();
  const hmac = crypto.createHmac("sha512", cleanSecret);
  return hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
};

/**
 * Tạo URL thanh toán VNPay Sandbox
 */
export const buildVnPayUrl = ({
  tmnCode,
  hashSecret,
  vnpUrl,
  returnUrl,
  ipAddr = "127.0.0.1",
  amount, // Số tiền nguyên thủy VNĐ (hàm này sẽ nhân 100)
  txnRef,
  orderInfo,
  orderType = "billpayment",
  locale = "vn",
  currCode = "VND",
  bankCode,
  expireMinutes = 15,
}) => {
  const now = new Date();
  const createDate = formatVnPayDate(now);
  const expireDate = formatVnPayDate(new Date(now.getTime() + expireMinutes * 60 * 1000));

  // Chuẩn hóa và làm sạch txnRef (chỉ giữ ký tự an toàn a-zA-Z0-9_-, không chứa dấu cách hay #)
  const cleanTxnRef = String(txnRef || `RH${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 34);

  // Chuẩn hóa orderInfo (bỏ ký tự lạ, tối đa 250 ký tự)
  const cleanOrderInfo = String(orderInfo || `Thanh toan don hang ${cleanTxnRef}`)
    .replace(/[#^]/g, "")
    .trim()
    .slice(0, 250);

  const cleanTmnCode = String(tmnCode || "").trim();
  const cleanHashSecret = String(hashSecret || "").trim();

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: cleanTmnCode,
    vnp_Locale: locale,
    vnp_CurrCode: currCode,
    vnp_TxnRef: cleanTxnRef,
    vnp_OrderInfo: cleanOrderInfo,
    vnp_OrderType: orderType,
    vnp_Amount: Math.round(Number(amount) * 100), // VNPay quy định nhân 100 và là số nguyên
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr === "::1" ? "127.0.0.1" : ipAddr,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  if (bankCode) {
    vnpParams.vnp_BankCode = bankCode;
  }

  const signData = buildVnPaySignData(vnpParams);
  const secureHash = createVnPaySignature(signData, cleanHashSecret);

  return `${vnpUrl}?${signData}&vnp_SecureHash=${secureHash}`;
};

/**
 * Xác thực chữ ký VNPay (áp dụng cho Return URL và IPN webhook)
 */
export const verifyVnPaySignature = (vnpParams = {}, hashSecret) => {
  const secureHash = vnpParams.vnp_SecureHash;
  if (!secureHash) return false;

  const cleanParams = {};
  for (const [key, val] of Object.entries(vnpParams)) {
    if (key.startsWith("vnp_") && key !== "vnp_SecureHash" && key !== "vnp_SecureHashType") {
      cleanParams[key] = val;
    }
  }

  const signData = buildVnPaySignData(cleanParams);
  const calculatedHash = createVnPaySignature(signData, hashSecret);

  return secureHash.toLowerCase() === calculatedHash.toLowerCase();
};
