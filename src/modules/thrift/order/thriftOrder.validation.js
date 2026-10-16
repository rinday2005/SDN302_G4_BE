import mongoose from "mongoose";
import { THRIFT_ORDER_STATUS } from "./thriftOrder.model.js";

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

export const validateCheckoutThriftOrder = (req, res, next) => {
  const { listingIds, shippingAddress, shippingFee } = req.body;

  if (listingIds !== undefined) {
    if (!Array.isArray(listingIds)) {
      return fail(next, "listingIds phải là một danh sách", "INVALID_LISTING_IDS");
    }
    for (const id of listingIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return fail(next, `Mã sản phẩm không hợp lệ: ${id}`, "INVALID_PRODUCT_ID");
      }
    }
  }

  if (shippingAddress !== undefined) {
    if (typeof shippingAddress !== "object" || shippingAddress === null) {
      return fail(next, "shippingAddress phải là một đối tượng hợp lệ", "INVALID_SHIPPING_ADDRESS");
    }

    const requiredAddressFields = [
      ["recipientName", "Tên người nhận là bắt buộc", "RECIPIENT_NAME_REQUIRED"],
      ["recipientPhone", "Số điện thoại người nhận là bắt buộc", "RECIPIENT_PHONE_REQUIRED"],
      ["province", "Tỉnh/Thành phố là bắt buộc", "PROVINCE_REQUIRED"],
      ["district", "Quận/Huyện là bắt buộc", "DISTRICT_REQUIRED"],
      ["ward", "Phường/Xã là bắt buộc", "WARD_REQUIRED"],
      ["detail", "Địa chỉ chi tiết là bắt buộc", "ADDRESS_DETAIL_REQUIRED"],
    ];

    for (const [field, message, errorCode] of requiredAddressFields) {
      const val = shippingAddress[field];
      if (typeof val !== "string" || !val.trim()) {
        return fail(next, message, errorCode);
      }
    }
  }

  if (shippingFee !== undefined && shippingFee !== null) {
    if (isNaN(Number(shippingFee)) || Number(shippingFee) < 0) {
      return fail(next, "shippingFee phải là số không âm", "INVALID_SHIPPING_FEE");
    }
  }

  next();
};

export const validateUpdateThriftOrderStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = Object.values(THRIFT_ORDER_STATUS);

  if (!status || !validStatuses.includes(status)) {
    return fail(
      next,
      `Trạng thái đơn hàng phải là một trong: ${validStatuses.join(", ")}`,
      "INVALID_ORDER_STATUS"
    );
  }

  next();
};
