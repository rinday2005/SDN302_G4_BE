import {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  approveOrder,
  rejectOrder,
  handoverOrder,
  confirmReceivedOrder,
  requestReturnOrder,
  inspectAndRefundOrder,
} from "./order.service.js";
import cloudinary from "../../../config/cloudinary.js";
import { successResponse } from "../../../utils/response.js";

const createOrderController = async (req, res, next) => {
  try {
    const order = await createOrder({
      user: req.user,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      shippingAddress: req.body.shippingAddress,
    });

    return successResponse(res, "Order created successfully", order, 201);
  } catch (error) {
    next(error);
  }
};

const getUserOrdersController = async (req, res, next) => {
  try {
    const result = await getUserOrders(req.user._id, req.query);

    return successResponse(res, "Orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

const getOrderByIdController = async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.id, req.user);

    return successResponse(res, "Order details retrieved successfully", order);
  } catch (error) {
    next(error);
  }
};

const getAllOrdersController = async (req, res, next) => {
  try {
    const result = await getAllOrders(req.user, req.query);

    return successResponse(res, "Shop orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

const updateOrderStatusController = async (req, res, next) => {
  try {
    const order = await updateOrderStatus(req.params.id, req.body.status, req.user);

    return successResponse(res, "Order status updated successfully", order);
  } catch (error) {
    next(error);
  }
};

const cancelOrderController = async (req, res, next) => {
  try {
    const order = await cancelOrder(req.params.id, req.user);

    return successResponse(res, "Order cancelled successfully", order);
  } catch (error) {
    next(error);
  }
};

const approveOrderController = async (req, res, next) => {
  try {
    const order = await approveOrder(req.params.id, req.user);

    return successResponse(res, "Order approved successfully. Waiting for payment.", order);
  } catch (error) {
    next(error);
  }
};

const rejectOrderController = async (req, res, next) => {
  try {
    const order = await rejectOrder(req.params.id, req.user, {
      reason: req.body?.reason,
    });

    return successResponse(res, "Order rejected successfully", order);
  } catch (error) {
    next(error);
  }
};

const handoverOrderController = async (req, res, next) => {
  try {
    const order = await handoverOrder(req.params.id, req.user, {
      carrierName: req.body.carrierName,
      trackingCode: req.body.trackingCode,
      status: req.body.status,
    });

    return successResponse(
      res,
      "Order handover information updated successfully",
      order
    );
  } catch (error) {
    next(error);
  }
};

const uploadBufferToCloudinary = (buffer, folder = "reuse_hub/cla_proofs") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

const confirmReceivedOrderController = async (req, res, next) => {
  try {
    let images = [];
    const photos = {
      slot1: req.body?.photos?.slot1 || req.body?.slot1 || "",
      slot2: req.body?.photos?.slot2 || req.body?.slot2 || "",
      slot3: req.body?.photos?.slot3 || req.body?.slot3 || "",
    };

    // 1. Nếu có file upload từ multipart/form-data
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const uploadedUrl = await uploadBufferToCloudinary(file.buffer, "reuse_hub/cla_proofs");
        images.push(uploadedUrl);
        if (file.fieldname === "slot1" || file.fieldname === "photos[slot1]") photos.slot1 = uploadedUrl;
        else if (file.fieldname === "slot2" || file.fieldname === "photos[slot2]") photos.slot2 = uploadedUrl;
        else if (file.fieldname === "slot3" || file.fieldname === "photos[slot3]") photos.slot3 = uploadedUrl;
      }
    } else if (req.file) {
      const uploadedUrl = await uploadBufferToCloudinary(req.file.buffer, "reuse_hub/cla_proofs");
      images.push(uploadedUrl);
    }

    // 2. Nếu có mảng ảnh hoặc ảnh string truyền trong body
    if (req.body?.images) {
      if (Array.isArray(req.body.images)) {
        images.push(...req.body.images);
      } else if (typeof req.body.images === "string") {
        images.push(req.body.images);
      }
    }

    const payload = {
      photos: {
        slot1: photos.slot1 || (images[0] || ""),
        slot2: photos.slot2 || (images[1] || ""),
        slot3: photos.slot3 || (images[2] || ""),
      },
      images,
      note: req.body?.note || "",
      signerName: req.body?.signerName || "",
      signerPhone: req.body?.signerPhone || "",
    };

    const order = await confirmReceivedOrder(req.params.id, req.user, payload);

    return successResponse(
      res,
      "Biên bản bàn giao CLA và xác nhận nhận hàng đã được lưu thành công. Bắt đầu thời gian thuê.",
      order
    );
  } catch (error) {
    next(error);
  }
};

const requestReturnOrderController = async (req, res, next) => {
  try {
    let images = [];

    // 1. Nếu có file upload từ multipart/form-data
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const uploadPromises = req.files.map((file) =>
        uploadBufferToCloudinary(file.buffer)
      );
      const uploadedUrls = await Promise.all(uploadPromises);
      images.push(...uploadedUrls);
    } else if (req.file) {
      const uploadedUrl = await uploadBufferToCloudinary(req.file.buffer);
      images.push(uploadedUrl);
    }

    // 2. Nếu có mảng ảnh truyền dạng URL trong body
    if (req.body.images) {
      if (Array.isArray(req.body.images)) {
        images.push(...req.body.images);
      } else if (typeof req.body.images === "string") {
        images.push(req.body.images);
      }
    }

    const order = await requestReturnOrder(req.params.id, req.user, {
      images,
      note: req.body.note,
    });

    return successResponse(
      res,
      "Return request submitted successfully. Waiting for shop review.",
      order
    );
  } catch (error) {
    next(error);
  }
};

const inspectAndRefundOrderController = async (req, res, next) => {
  try {
    let damageImages = [];

    // 1. Nếu có file upload từ form-data (array, fields object, hoặc single file)
    let filesToUpload = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      filesToUpload = req.files;
    } else if (req.files && typeof req.files === "object") {
      filesToUpload = Object.values(req.files).flat();
    } else if (req.file) {
      filesToUpload = [req.file];
    }

    if (filesToUpload.length > 0) {
      const uploadPromises = filesToUpload.map((file) =>
        uploadBufferToCloudinary(file.buffer)
      );
      const uploadedUrls = await Promise.all(uploadPromises);
      damageImages.push(...uploadedUrls);
    }

    // 2. Nếu có mảng ảnh trong body (damageImages hoặc images)
    const bodyImages = req.body.damageImages || req.body.images;
    if (bodyImages) {
      if (Array.isArray(bodyImages)) {
        damageImages.push(...bodyImages);
      } else if (typeof bodyImages === "string") {
        damageImages.push(bodyImages);
      }
    }

    // Parse itemInspections nếu gửi chuỗi JSON
    let itemInspections = req.body.itemInspections || [];
    if (typeof itemInspections === "string") {
      try {
        itemInspections = JSON.parse(itemInspections);
      } catch (e) {
        itemInspections = [];
      }
    }

    const order = await inspectAndRefundOrder(req.params.id, req.user, {
      damagePenaltyAmount: req.body.damagePenaltyAmount,
      reason: req.body.reason || req.body.damageReason,
      damageImages,
      itemInspections,
    });

    return successResponse(
      res,
      "Order inspection and refund decision completed successfully. Order marked as COMPLETED.",
      order
    );
  } catch (error) {
    next(error);
  }
};

export {
  createOrderController,
  getUserOrdersController,
  getOrderByIdController,
  getAllOrdersController,
  updateOrderStatusController,
  cancelOrderController,
  approveOrderController,
  rejectOrderController,
  handoverOrderController,
  confirmReceivedOrderController,
  requestReturnOrderController,
  inspectAndRefundOrderController,
};
