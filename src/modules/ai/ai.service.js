import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import RentalOrder from "../rent/order/order.model.js";
import AIConversation from "./ai.model.js";
import { calculateShippingFee } from "../../utils/shipping.js";

const formatVND = (n) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;

const mapRentDocToAIRec = (doc, days = 4, maxBudget = 300000) => {
  const pricePerDay = Number(doc.pricePerDay || doc.rentPrice || 250000);
  const depositAmount = Number(doc.depositAmount || doc.deposit || pricePerDay * 10);
  const isWithinBudget = pricePerDay <= maxBudget;

  return {
    id: String(doc._id),
    sku: doc.sku || `RNT-${String(doc._id).slice(-5).toUpperCase()}`,
    name: doc.name || doc.title || "Thiết bị thuê ReUse Hub",
    category: doc.categoryName || "Thiết bị & Phụ kiện",
    type: "RENT",
    image:
      (Array.isArray(doc.images) && doc.images[0]) ||
      doc.image ||
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80",
    pricePerDay,
    depositAmount,
    conditionGrade: doc.condition || "98% · Chuẩn CLA",
    location: doc.location || "Đà Nẵng",
    rating: 4.9,
    reviewCount: 28,
    budgetTag: isWithinBudget ? "Phù hợp ngân sách" : "Phân khúc cao cấp",
    calculatedDays: days,
    calculatedTotalRent: pricePerDay * days,
    pros: [
      `Đã kiểm định kỹ thuật tại kho ${doc.location || "Đà Nẵng"}`,
      "Bảo vệ tiền đặt cọc 100% qua hợp đồng Smart Escrow",
    ],
    cons: ["Nên đặt lịch trước 1–2 ngày vào dịp cuối tuần"],
    bestFor: "Du lịch, sự kiện ngắn ngày và trải nghiệm thiết bị",
    detailUrl: `/rent/products/${doc._id}`,
  };
};

const mapThriftDocToAIRec = (doc) => {
  const thriftPrice = Number(doc.resalePrice || doc.price || 590000);
  const originalRetailPrice = Number(doc.originalPrice || Math.round(thriftPrice * 2.1));

  return {
    id: String(doc._id),
    sku: doc.sku || `THF-${String(doc._id).slice(-5).toUpperCase()}`,
    name: doc.title || doc.name || "Sản phẩm thanh lý Second-Life",
    category: doc.category || "Thanh lý THRIFT",
    type: "THRIFT",
    image:
      (Array.isArray(doc.images) && doc.images[0]) ||
      doc.image ||
      "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80",
    thriftPrice,
    originalRetailPrice,
    conditionGrade: doc.condition || "Grade A+",
    location: doc.location || "Đà Nẵng",
    rating: 4.8,
    reviewCount: 19,
    budgetTag: "Tiết kiệm Second-Life",
    pros: [
      "Tiết kiệm 45% – 70% so với mua mới",
      `Hiện vật sẵn sàng giao từ kho ${doc.location || "Đà Nẵng"}`,
    ],
    cons: ["Số lượng giới hạn chỉ 1 hiện vật duy nhất"],
    bestFor: "Sở hữu lâu dài với chi phí tối ưu",
    detailUrl: `/thrift/${doc._id}`,
  };
};

export const getRecommendationsFromDB = async ({
  days = 4,
  maxBudget = 300000,
  type = "ALL",
  keyword = "",
  limit = 6,
} = {}) => {
  const results = [];

  if (type === "ALL" || type === "RENT") {
    const rentFilter = { isAvailable: { $ne: false } };
    if (keyword) {
      rentFilter.name = { $regex: keyword, $options: "i" };
    }
    const rentDocs = await RentalProduct.find(rentFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    results.push(...rentDocs.map((d) => mapRentDocToAIRec(d, days, maxBudget)));
  }

  if (type === "ALL" || type === "THRIFT") {
    const thriftFilter = {};
    if (keyword) {
      thriftFilter.title = { $regex: keyword, $options: "i" };
    }
    const thriftDocs = await ThriftListing.find(thriftFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    results.push(...thriftDocs.map((d) => mapThriftDocToAIRec(d)));
  }

  return results;
};

export const processAIChatPrompt = async ({
  prompt = "",
  user = null,
  preferences = {},
  activeProductId = null,
} = {}) => {
  const q = String(prompt || "").toLowerCase();
  const nowTime = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const daysMatch = q.match(/(\d+)\s*ngày/);
  const days = daysMatch
    ? Math.max(1, Number(daysMatch[1]))
    : Number(preferences.travelDaysDefault) || 4;

  let maxBudget = Number(preferences.maxDailyRentBudget) || 300000;
  const kMatch = q.match(/(\d+)\s*k/);
  const fullNumMatch = q.match(/(\d{3})[.,]?(\d{3})/);
  if (fullNumMatch) {
    maxBudget = Number(`${fullNumMatch[1]}${fullNumMatch[2]}`);
  } else if (kMatch) {
    maxBudget = Number(kMatch[1]) * 1000;
  }

  // 1. Tra cứu đơn thuê & tiền cọc Smart Escrow của User từ MongoDB
  if (
    q.includes("tra cứu") ||
    q.includes("đơn thuê") ||
    q.includes("đơn mua") ||
    q.includes("hoàn cọc") ||
    (q.includes("tiền cọc") && (q.includes("của mình") || q.includes("hiện tại")))
  ) {
    if (!user?._id) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Cần đăng nhập để tra cứu hồ sơ cá nhân",
        bannerSubtitle: "Khách (Guest) vẫn có thể tìm kiếm, so sánh và ước tính chi phí tự do.",
        text: "Để tra cứu trực tiếp mã đơn thuê, trạng thái vận chuyển và số dư tiền đặt cọc Smart Escrow của riêng bạn, vui lòng đăng nhập tài khoản Customer nhé!",
        quickFollowUps: [
          "Mình cần thuê máy ảnh đi du lịch 4 ngày, ngân sách dưới 300.000đ/ngày.",
          "Giải thích cơ chế bảo vệ tiền cọc Smart Escrow",
        ],
      };
    }

    const userOrders = await RentalOrder.find({ renterId: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const orderSummaries = userOrders.map((o) => {
      const st = String(o.status || "RENTING").toUpperCase();
      const isCompleted = st === "COMPLETED";
      const dep = Number(o.depositAmount) || 0;
      const refundVal =
        typeof o.inspectionResult?.refundAmount === "number"
          ? o.inspectionResult.refundAmount
          : dep;

      return {
        orderCode: o.orderCode?.startsWith("#")
          ? o.orderCode
          : `#${o.orderCode || String(o._id).slice(-6).toUpperCase()}`,
        productName: o.items?.[0]?.productName || "Thiết bị thuê ReUse Hub",
        type: "RENT",
        statusLabel: isCompleted
          ? "Đã hoàn tất & Hoàn cọc"
          : ["RETURN_REQUESTED", "RETURNING", "RETURNED"].includes(st)
            ? "Đang đối kiểm hoàn cọc"
            : "Đang trong kỳ thuê",
        depositAmount: dep,
        escrowStatus: isCompleted
          ? `Đã giải tỏa ${formatVND(refundVal)} về Ví khả dụng`
          : "Đang khóa bảo chứng trong Smart Escrow",
        expectedRefundNote: isCompleted
          ? "Tiền cọc đã cộng vào Số dư khả dụng tại Ví của bạn."
          : "Hoàn tự động ngay sau khi xưởng hoàn tất đối kiểm CLA khi trả đồ.",
        detailUrl: `/rent/orders/${o._id}`,
      };
    });

    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: `Hồ sơ đơn thuê & Tiền đặt cọc của ${user.fullName || user.email || "bạn"}`,
      bannerSubtitle: "Dữ liệu truy xuất trực tiếp từ MongoDB & Smart Escrow.",
      text:
        orderSummaries.length > 0
          ? "Dưới đây là trạng thái các khoản đặt cọc và đơn hàng thực tế của bạn:"
          : "Tài khoản của bạn hiện chưa phát sinh đơn thuê nào. Hãy thử tìm kiếm sản phẩm bên dưới nhé!",
      orderSummaries,
      quickFollowUps: [
        "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
        "Mình cần thuê máy ảnh đi du lịch 4 ngày, ngân sách dưới 300.000đ/ngày.",
      ],
    };
  }

  // 2. Tính chi phí thuê, vận chuyển 2 chiều theo địa chỉ & tiền cọc
  if (
    q.includes("tính chi phí") ||
    q.includes("tổng chi phí") ||
    q.includes("giải thích") ||
    q.includes("tiền cọc") ||
    q.includes("escrow") ||
    q.includes("cla")
  ) {
    let targetDoc = null;
    if (activeProductId && /^[0-9a-fA-F]{24}$/.test(String(activeProductId))) {
      targetDoc = await RentalProduct.findById(activeProductId).lean();
    }
    if (!targetDoc) {
      targetDoc = await RentalProduct.findOne({ isAvailable: { $ne: false } }).lean();
    }

    const mapped = targetDoc
      ? mapRentDocToAIRec(targetDoc, days, maxBudget)
      : {
          id: "cam-canon-m50",
          sku: "RNT-CAM-M50",
          name: "Canon EOS M50",
          category: "Máy ảnh & Quay phim",
          type: "RENT",
          image:
            "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80",
          pricePerDay: 250000,
          depositAmount: 3500000,
          conditionGrade: "98% · Chuẩn CLA",
          location: "Đà Nẵng",
          rating: 4.9,
          reviewCount: 42,
          budgetTag: "Phù hợp ngân sách",
          calculatedDays: days,
          calculatedTotalRent: 250000 * days,
          pros: ["Màn hình xoay lật 180°", "Dual Pixel AF lấy nét nhanh"],
          cons: ["Pin chụp khoảng 250 tấm/lần sạc"],
          bestFor: "Du lịch, Vlog",
          detailUrl: "/rent/marketplace",
        };

    const userLocation = user?.address || preferences.preferredLocation || "Đà Nẵng";
    const shippingFee = calculateShippingFee(mapped.location || "Đà Nẵng", userLocation);
    const rentalSubtotal = mapped.pricePerDay * days;

    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: `Bảng ước tính & Giải thích chi phí (${days} ngày)`,
      bannerSubtitle: "Minh bạch 100% · Tự động tính phí vận chuyển 2 chiều theo chi nhánh.",
      text: `Mình bóc tách chi tiết từng khoản khi bạn thuê ${mapped.name} (Chi nhánh ${mapped.location}) trong ${days} ngày:`,
      costBreakdown: {
        title: `Dự toán chi phí thuê ${days} ngày`,
        productName: mapped.name,
        days,
        dailyRate: mapped.pricePerDay,
        rentalSubtotal,
        escrowDeposit: mapped.depositAmount,
        shippingFee,
        totalUpfront: rentalSubtotal + mapped.depositAmount + shippingFee,
        refundableAmount: mapped.depositAmount,
        notes: [
          `Chi phí thực tế tiêu dùng: ${formatVND(rentalSubtotal + shippingFee)} (Tiền thuê + Phí vận chuyển 2 chiều từ kho ${mapped.location}).`,
          `Khoản đặt cọc ${formatVND(mapped.depositAmount)} được khóa bảo chứng trong Smart Escrow.`,
          "Ngay khi trả đồ và nghiệm thu đạt chuẩn, 100% tiền cọc được hoàn tự động về Ví khả dụng của bạn.",
        ],
      },
      recommendations: [mapped],
      quickFollowUps: [
        "So sánh Canon EOS M50 và Sony A6000",
        "Mình cần thuê máy ảnh đi du lịch 4 ngày, ngân sách dưới 300.000đ/ngày.",
      ],
    };
  }

  // 3. Tư vấn sản phẩm THRIFT
  if (q.includes("thrift") || q.includes("thanh lý") || q.includes("second-life")) {
    const thriftRecs = await getRecommendationsFromDB({ type: "THRIFT", limit: 4 });
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Gợi ý hiện vật THRIFT (Second-Life) chuẩn kiểm định!",
      bannerSubtitle: "Dữ liệu trực tiếp từ kho thanh lý ReUse Hub.",
      text: "Các sản phẩm dưới đây được kiểm định chất lượng minh bạch với mức giá tiết kiệm vượt trội:",
      recommendations: thriftRecs,
      quickFollowUps: [
        "Khi nào nên mua đồ THRIFT thay vì thuê RENT?",
        "Mình cần thuê máy ảnh đi du lịch 4 ngày, ngân sách dưới 300.000đ/ngày.",
      ],
    };
  }

  // 4. Tìm kiếm sản phẩm RENT từ MongoDB theo ngân sách & số ngày
  const rentDocs = await RentalProduct.find({
    isAvailable: { $ne: false },
    pricePerDay: { $lte: maxBudget },
  })
    .sort({ pricePerDay: 1 })
    .limit(3)
    .lean();

  const mappedRent = rentDocs.map((d) => mapRentDocToAIRec(d, days, maxBudget));

  return {
    id: `ai-${Date.now()}`,
    sender: "ai",
    timestamp: nowTime,
    bannerTitle: "Mình tìm thấy một số sản phẩm phù hợp với bạn!",
    bannerSubtitle: "Đã lọc theo giá thuê và thời gian sử dụng từ cơ sở dữ liệu.",
    text: `Dựa trên nhu cầu thuê ${days} ngày với ngân sách dưới ${formatVND(maxBudget)}/ngày, đây là các thiết bị phù hợp nhất hiện có trong kho:`,
    recommendations: mappedRent,
    quickFollowUps: [
      "So sánh ưu nhược điểm Canon EOS M50 và Sony A6000",
      `Tính tổng chi phí thuê trong ${days} ngày`,
      "Nên thuê ngắn hạn hay mua thanh lý THRIFT?",
    ],
  };
};

export const saveConversationSession = async ({ userId, title, messages, preferences }) => {
  if (!userId) return null;
  const session = await AIConversation.findOneAndUpdate(
    { userId },
    {
      $set: {
        title: title || "Hội thoại tư vấn ReUse AI",
        ...(preferences ? { preferences } : {}),
        messages: Array.isArray(messages) ? messages.slice(-30) : [],
      },
    },
    { new: true, upsert: true }
  ).lean();
  return session;
};

export const getUserConversationHistory = async (userId) => {
  if (!userId) return [];
  return AIConversation.find({ userId }).sort({ updatedAt: -1 }).limit(10).lean();
};

