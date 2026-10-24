import mongoose from "mongoose";
import RentalProduct from "./product.model.js";
import RentalOrder from "../order/order.model.js";

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tạo sản phẩm cho thuê
 */
const createProduct = async (productData, ownerId) => {
  const {
    ownerId: ignoredOwnerId,
    status: ignoredStatus,
    ...safeData
  } = productData;

  const product = await RentalProduct.create({
    ...safeData,
    ownerId,
    status: "PENDING_APPROVAL",
  });

  return product;
};

/**
 * Cập nhật sản phẩm cho thuê
 */
const updateProduct = async (productId, ownerId, updateData) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(
      "Product id không hợp lệ",
      400,
      "INVALID_PRODUCT_ID"
    );
  }

  const product = await RentalProduct.findById(productId);

  if (!product) {
    throw createError(
      "Không tìm thấy sản phẩm",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  if (product.ownerId.toString() !== ownerId.toString()) {
    throw createError(
      "Bạn không có quyền cập nhật sản phẩm này",
      403,
      "FORBIDDEN"
    );
  }

  const {
    ownerId: ignoredOwnerId,
    status: ignoredStatus,
    ...safeUpdateData
  } = updateData;

  Object.assign(product, safeUpdateData);

  await product.save();

  return product;
};

/**
 * Xóa sản phẩm cho thuê
 */
const deleteProduct = async (productId, ownerId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(
      "Product id không hợp lệ",
      400,
      "INVALID_PRODUCT_ID"
    );
  }

  const product = await RentalProduct.findById(productId);

  if (!product) {
    throw createError(
      "Không tìm thấy sản phẩm",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  if (product.ownerId.toString() !== ownerId.toString()) {
    throw createError(
      "Bạn không có quyền xóa sản phẩm này",
      403,
      "FORBIDDEN"
    );
  }

  await product.deleteOne();

  return product;
};

/**
 * [BE-S2-05]
 * Public search + filter + pagination Rental Products
 */
const getPublicProducts = async (query = {}) => {
  const {
    keyword,
    categoryId,
    minPrice,
    maxPrice,
    province,
    size,
    page = 1,
    limit = 12,
    sortBy = "newest",
  } = query;

  const filter = {
    status: "APPROVED",
  };

  if (size && size !== "ALL" && size !== "all") {
    const s = size.trim().toUpperCase();
    filter.$or = [
      { size: s },
      { sizes: s },
    ];
  }

  if (keyword?.trim()) {
    const safeKeyword = escapeRegex(keyword.trim());

    filter.$or = [
      {
        name: {
          $regex: safeKeyword,
          $options: "i",
        },
      },
      {
        description: {
          $regex: safeKeyword,
          $options: "i",
        },
      },
    ];
  }

  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw createError(
        "categoryId không hợp lệ",
        400,
        "INVALID_CATEGORY_ID"
      );
    }

    filter.categoryId = categoryId;
  }

  const parsedMinPrice =
    minPrice !== undefined && minPrice !== ""
      ? Number(minPrice)
      : null;

  const parsedMaxPrice =
    maxPrice !== undefined && maxPrice !== ""
      ? Number(maxPrice)
      : null;

  if (
    parsedMinPrice !== null &&
    (Number.isNaN(parsedMinPrice) || parsedMinPrice < 0)
  ) {
    throw createError(
      "minPrice không hợp lệ",
      400,
      "INVALID_MIN_PRICE"
    );
  }

  if (
    parsedMaxPrice !== null &&
    (Number.isNaN(parsedMaxPrice) || parsedMaxPrice < 0)
  ) {
    throw createError(
      "maxPrice không hợp lệ",
      400,
      "INVALID_MAX_PRICE"
    );
  }

  if (
    parsedMinPrice !== null &&
    parsedMaxPrice !== null &&
    parsedMinPrice > parsedMaxPrice
  ) {
    throw createError(
      "minPrice không được lớn hơn maxPrice",
      400,
      "INVALID_PRICE_RANGE"
    );
  }

  if (parsedMinPrice !== null || parsedMaxPrice !== null) {
    filter.pricePerDay = {};

    if (parsedMinPrice !== null) {
      filter.pricePerDay.$gte = parsedMinPrice;
    }

    if (parsedMaxPrice !== null) {
      filter.pricePerDay.$lte = parsedMaxPrice;
    }
  }

  if (province?.trim()) {
    filter.location = {
      $regex: escapeRegex(province.trim()),
      $options: "i",
    };
  }

  const parsedPage = Math.max(1, Number(page) || 1);

  const parsedLimit = Math.min(
    500,
    Math.max(1, Number(limit) || 12)
  );

  const skip = (parsedPage - 1) * parsedLimit;

  let sort = {
    createdAt: -1,
  };

  switch (sortBy) {
    case "price_asc":
      sort = {
        pricePerDay: 1,
      };
      break;

    case "price_desc":
      sort = {
        pricePerDay: -1,
      };
      break;

    case "name_asc":
      sort = {
        name: 1,
      };
      break;

    case "name_desc":
      sort = {
        name: -1,
      };
      break;

    case "oldest":
      sort = {
        createdAt: 1,
      };
      break;

    case "newest":
    default:
      sort = {
        createdAt: -1,
      };
      break;
  }

  const [products, total] = await Promise.all([
    RentalProduct.find(filter)
      .populate(
        "ownerId",
        "fullName email phoneNumber address avatarUrl role"
      )
      .populate(
        "categoryId",
        "name slug type"
      )
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit)
      .lean(),

    RentalProduct.countDocuments(filter),
  ]);

  return {
    products,

    pagination: {
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      limit: parsedLimit,
    },
  };
};

/**
 * [BE-S2-06]
 * Public product detail + busy calendar
 */
const getPublicProductDetail = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(
      "Sản phẩm không tồn tại",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  const product = await RentalProduct.findOne({
    _id: productId,
    status: "APPROVED",
  })
    .populate(
      "ownerId",
      "fullName email phoneNumber address avatarUrl role"
    )
    .populate(
      "categoryId",
      "name slug type"
    )
    .lean();

  if (!product) {
    throw createError(
      "Sản phẩm không tồn tại hoặc chưa được duyệt",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  const activeOrders = await RentalOrder.find({
    status: {
      $nin: [
        "REJECTED",
        "CANCELLED",
        "COMPLETED",
      ],
    },

    "items.productId": product._id,
  })
    .select(
      "startDate endDate status items"
    )
    .lean();

  const events = [];

  for (const order of activeOrders) {
    let bookedQuantity = 0;

    for (const item of order.items || []) {
      if (
        item.productId &&
        item.productId.toString() ===
          product._id.toString()
      ) {
        bookedQuantity += Number(
          item.quantity || 0
        );
      }
    }

    if (bookedQuantity <= 0) {
      continue;
    }

    const startTime =
      new Date(order.startDate).getTime();

    const endTime =
      new Date(order.endDate).getTime();

    if (
      Number.isNaN(startTime) ||
      Number.isNaN(endTime) ||
      startTime > endTime
    ) {
      continue;
    }

    events.push({
      time: startTime,
      delta: bookedQuantity,
    });

    events.push({
      time: endTime + 1,
      delta: -bookedQuantity,
    });
  }

  const eventMap = new Map();

  for (const event of events) {
    eventMap.set(
      event.time,
      (eventMap.get(event.time) || 0) +
        event.delta
    );
  }

  const sortedEvents = [
    ...eventMap.entries(),
  ]
    .map(([time, delta]) => ({
      time: Number(time),
      delta,
    }))
    .sort(
      (first, second) =>
        first.time - second.time
    );

  const busyCalendar = [];

  let currentBookedQuantity = 0;

  for (
    let index = 0;
    index < sortedEvents.length;
    index += 1
  ) {
    const currentEvent =
      sortedEvents[index];

    currentBookedQuantity +=
      currentEvent.delta;

    const nextEvent =
      sortedEvents[index + 1];

    if (!nextEvent) {
      continue;
    }

    const segmentStart =
      currentEvent.time;

    const segmentEnd =
      nextEvent.time - 1;

    if (segmentStart > segmentEnd) {
      continue;
    }

    const availableQuantity =
      Math.max(
        0,
        product.totalQuantity -
          currentBookedQuantity
      );

    if (
      currentBookedQuantity >=
      product.totalQuantity
    ) {
      busyCalendar.push({
        startDate:
          new Date(segmentStart),

        endDate:
          new Date(segmentEnd),

        bookedQuantity:
          currentBookedQuantity,

        availableQuantity,
      });
    }
  }

  const mergedBusyCalendar = [];

  for (const period of busyCalendar) {
    const previous =
      mergedBusyCalendar[
        mergedBusyCalendar.length - 1
      ];

    const isContinuous =
      previous &&
      new Date(
        previous.endDate
      ).getTime() +
        1 ===
        new Date(
          period.startDate
        ).getTime();

    const sameBookedQuantity =
      previous &&
      previous.bookedQuantity ===
        period.bookedQuantity;

    const sameAvailableQuantity =
      previous &&
      previous.availableQuantity ===
        period.availableQuantity;

    if (
      isContinuous &&
      sameBookedQuantity &&
      sameAvailableQuantity
    ) {
      previous.endDate =
        period.endDate;
    } else {
      mergedBusyCalendar.push({
        ...period,
      });
    }
  }

  return {
    product,

    availability: {
      totalQuantity:
        product.totalQuantity,

      busyCalendar:
        mergedBusyCalendar,
    },
  };
};

export {
  createProduct,
  updateProduct,
  deleteProduct,
  getPublicProducts,
  getPublicProductDetail,
};