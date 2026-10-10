import crypto from "crypto";

/**
 * Định dạng ngày giờ theo chuẩn VNPay (YYYYMMDDHHmmss, GMT+7)
 */
export const formatVnPayDate = (date = new Date()) => {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnDate = new Date(utc + 7 * 3600000);

  const pad = (n) => String(n).padStart(2, "0");
  const year = vnDate.getFullYear();
  const month = pad(vnDate.getMonth() + 1);
  const day = pad(vnDate.getDate());
  const hours = pad(vnDate.getHours());
  const minutes = pad(vnDate.getMinutes());
  const seconds = pad(vnDate.getSeconds());

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
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
  const hmac = crypto.createHmac("sha512", hashSecret);
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
}) => {
  const createDate = formatVnPayDate(new Date());

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: locale,
    vnp_CurrCode: currCode,
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: orderType,
    vnp_Amount: Math.round(amount * 100), // VNPay quy định nhân 100
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr === "::1" ? "127.0.0.1" : ipAddr,
    vnp_CreateDate: createDate,
  };

  const signData = buildVnPaySignData(vnpParams);
  const secureHash = createVnPaySignature(signData, hashSecret);

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
