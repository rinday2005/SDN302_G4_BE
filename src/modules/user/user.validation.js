const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

/**
 * Middleware kiểm tra validation chặt chẽ khi cập nhật hồ sơ người dùng
 */
export const validateUpdateProfile = (req, res, next) => {
  const { fullName, phoneNumber, phone, avatarUrl, address } = req.body;

  // 1. Kiểm tra Họ và tên
  if (fullName !== undefined) {
    if (typeof fullName !== "string" || !fullName.trim()) {
      return fail(next, "Họ và tên không được để trống", "FULL_NAME_REQUIRED");
    }
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 70) {
      return fail(next, "Họ và tên phải có độ dài từ 2 đến 70 ký tự", "INVALID_FULL_NAME_LENGTH");
    }
    // Chặn các ký tự nguy hiểm, HTML tags
    if (/[<>{}[\]\\/]/.test(trimmedName)) {
      return fail(next, "Họ và tên chứa ký tự đặc biệt không hợp lệ", "INVALID_FULL_NAME_CHARS");
    }
  }

  // 2. Kiểm tra Số điện thoại
  const rawPhone = phoneNumber ?? phone;
  if (rawPhone !== undefined && rawPhone !== null && String(rawPhone).trim() !== "") {
    const cleanPhone = String(rawPhone).trim().replace(/[\s.-]/g, "");
    const phoneRegex = /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return fail(
        next,
        "Số điện thoại không đúng định dạng (Ví dụ: 0901234567 hoặc +84901234567)",
        "INVALID_PHONE_NUMBER"
      );
    }
  }

  // 3. Kiểm tra Avatar URL
  if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl === "string" && avatarUrl.trim()) {
    const trimmedUrl = avatarUrl.trim();
    if (
      !trimmedUrl.startsWith("http://") &&
      !trimmedUrl.startsWith("https://") &&
      !trimmedUrl.startsWith("data:image/")
    ) {
      return fail(next, "Đường dẫn ảnh đại diện không hợp lệ", "INVALID_AVATAR_URL");
    }
  }

  // 4. Kiểm tra Địa chỉ nếu có
  if (address !== undefined && address !== null) {
    if (typeof address === "object") {
      if (address.detail && typeof address.detail === "string" && address.detail.length > 255) {
        return fail(next, "Địa chỉ chi tiết không được vượt quá 255 ký tự", "ADDRESS_DETAIL_TOO_LONG");
      }
    }
  }

  next();
};
