import mongoose from "mongoose";

/**
 * DATA MẪU DÙNG CHO TESTING [BE-S4-04]
 * (Các bạn trong team có thể thay thế hoặc bổ sung data mẫu tại đây khi cập nhật dữ liệu chính thức)
 */

export const mockIds = {
  shopOwnerId: new mongoose.Types.ObjectId("6724a1111111111111111111"),
  otherShopOwnerId: new mongoose.Types.ObjectId("6724a2222222222222222222"),
  regularUserId: new mongoose.Types.ObjectId("6724a3333333333333333333"),
  rentalProductId: new mongoose.Types.ObjectId("6724a4444444444444444444"),
  categoryId: new mongoose.Types.ObjectId("6724a5555555555555555555"),
};

export const sampleUsers = {
  shopOwner: {
    _id: mockIds.shopOwnerId,
    role: "SHOP_OWNER",
    fullName: "Chủ Cửa Hàng Sample",
    email: "shopowner.sample@reusehub.vn",
  },
  otherShopOwner: {
    _id: mockIds.otherShopOwnerId,
    role: "SHOP_OWNER",
    fullName: "Shop Owner Khác Sample",
    email: "other.shop@reusehub.vn",
  },
  regularUser: {
    _id: mockIds.regularUserId,
    role: "USER",
    fullName: "Khách Thuê Sample",
    email: "renter.sample@reusehub.vn",
  },
};

export const sampleRentalProducts = {
  sonyCamera: {
    _id: mockIds.rentalProductId,
    ownerId: mockIds.shopOwnerId,
    name: "Máy ảnh Sony A7 Mark III",
    description: "Máy ảnh full-frame chuyên nghiệp kèm lens 28-70",
    condition: "LIKE_NEW",
    images: [
      "https://res.cloudinary.com/reusehub/image/upload/sample_sony_1.jpg",
      "https://res.cloudinary.com/reusehub/image/upload/sample_sony_2.jpg",
    ],
    categoryId: mockIds.categoryId,
    location: "Hồ Chí Minh",
    status: "APPROVED",
  },
  eveningDress: {
    _id: new mongoose.Types.ObjectId("6724a6666666666666666666"),
    ownerId: mockIds.shopOwnerId,
    name: "Váy dạ hội cao cấp Silk Dress",
    description: "Váy lụa đỏ nguyên bản phong cách thanh lịch",
    condition: "GOOD",
    images: [
      "https://res.cloudinary.com/reusehub/image/upload/sample_dress_1.jpg",
    ],
    categoryId: mockIds.categoryId,
    location: "Hà Nội",
    status: "APPROVED",
  },
};

export const sampleOrders = {
  activeRentingOrder: {
    _id: new mongoose.Types.ObjectId("6724a7777777777777777777"),
    orderCode: "RENT-SAMPLE-001",
    status: "RENTING",
    items: [
      {
        productId: mockIds.rentalProductId,
        quantity: 1,
      },
    ],
  },
};

export const sampleAvailabilities = {
  activeMaintenance: {
    _id: new mongoose.Types.ObjectId("6724a8888888888888888888"),
    productId: mockIds.rentalProductId,
    reason: "MAINTENANCE",
    endDate: new Date(Date.now() + 86400000), // Còn bảo trì trong 24h tới
  },
};

export const sampleConvertRequests = {
  validFullRequest: {
    rentalProductId: mockIds.rentalProductId,
    sellingPrice: 15000000,
    conditionDescription: "Máy đã qua 5 lần thuê, cảm biến sạch sẽ hoạt động hoàn hảo 99%",
    images: ["https://res.cloudinary.com/reusehub/image/upload/sample_thrift_actual.jpg"],
  },
  validFallbackImagesRequest: {
    rentalProductId: mockIds.rentalProductId,
    sellingPrice: 800000,
  },
};
