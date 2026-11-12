import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import RentalOrder from "../rent/order/order.model.js";
import AIConversation from "./ai.model.js";
import { calculateShippingFee } from "../../utils/shipping.js";

const formatVND = (n) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;

const normalizeVi = (str = "") =>
  String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP_WORDS = new Set([
  "minh",
  "toi",
  "can",
  "muon",
  "tim",
  "thue",
  "mua",
  "cho",
  "xem",
  "tu",
  "van",
  "san",
  "pham",
  "mon",
  "do",
  "co",
  "khong",
  "ko",
  "shop",
  "oi",
  "ban",
  "ai",
  "giup",
  "voi",
  "ngay",
  "ngan",
  "sach",
  "duoi",
  "tren",
  "khoang",
  "tam",
  "gia",
  "bao",
  "nhieu",
  "tien",
  "chi",
  "phi",
  "tinh",
  "tong",
  "uu",
  "nhuoc",
  "diem",
  "danh",
  "so",
  "sanh",
  "va",
  "voi",
  "hay",
  "hoac",
  "khi",
  "nao",
  "nen",
  "trong",
  "mot",
  "cai",
  "chiec",
  "bo",
  "mau",
  "loai",
  "nao",
  "vay",
  "a",
  "ạ",
  "nha",
  "nhe",
  "đi",
  "di",
  "du",
  "lich",
  "su",
  "kien",
  "cuoi",
  "tuan",
  "hien",
  "tai",
  "dang",
  "o",
  "tai",
]);

const CATEGORY_GROUPS = [
  {
    key: "PARTY_DRESS",
    label: "Đầm dự tiệc & Dạ hội",
    phrases: [
      "dam da hoi",
      "dam du tiec",
      "vay da hoi",
      "vay du tiec",
      "dam cuoi",
      "dam tiec",
      "dam maxi",
      "dam hoa nhi",
      "party dress",
      "duoi ca",
      "cup nguc",
      "cong chua",
      "sequins",
    ],
    tokens: ["dam", "vay", "dress"],
  },
  {
    key: "AO_DAI",
    label: "Áo dài",
    phrases: ["ao dai", "ao dai cach tan", "ao dai to tam", "ao dai lua"],
    tokens: [],
  },
  {
    key: "SUIT_VEST",
    label: "Suit & Vest",
    phrases: ["bo suit", "suit nam", "suit cuoi", "suit may do", "ao vest", "bo vest"],
    tokens: ["suit", "vest", "bespoke"],
  },
  {
    key: "OUTERWEAR",
    label: "Áo khoác & Blazer",
    phrases: [
      "ao khoac",
      "trench coat",
      "mang to",
      "ao mang to",
      "ao blazer",
      "blazer",
      "ao khoac da",
    ],
    tokens: ["blazer", "trench", "coat"],
  },
  {
    key: "KNITWEAR",
    label: "Áo len & Cardigan",
    phrases: ["ao len", "cardigan", "len cashmere", "co lo"],
    tokens: ["cardigan", "cashmere"],
  },
  {
    key: "SKIRT_SET",
    label: "Set trang phục & Chân váy",
    phrases: [
      "chan vay",
      "vay xep ly",
      "set ao",
      "set vay",
      "set cardigan",
      "ao so mi",
      "ao voan",
      "yem jeans",
      "yem denim",
      "croptop",
    ],
    tokens: ["yem", "denim", "jeans", "voan", "croptop"],
  },
  {
    key: "SHOES",
    label: "Giày dép",
    phrases: [
      "giay cao got",
      "giay sneaker",
      "classic sneakers",
      "giay loafer",
      "giay sandal",
      "chelsea boots",
      "giay da",
      "louboutin",
      "giay dep",
    ],
    tokens: ["giay", "sneaker", "sneakers", "loafer", "sandal", "boots", "louboutin", "vibram"],
  },
  {
    key: "ACCESSORIES",
    label: "Phụ kiện & Trang sức",
    phrases: [
      "bong tai",
      "khuyen tai",
      "day chuyen",
      "vong co",
      "vong tay",
      "cai ao",
      "tram ngoc trai",
      "quat gap",
      "quat lua",
      "ngoc bich",
      "ngoc trai",
      "moissanite",
      "phu kien",
      "trang suc",
    ],
    tokens: ["quat", "tram", "moissanite"],
  },
];

const NON_FASHION_KEYWORDS = [
  "may anh",
  "camera",
  "canon",
  "sony",
  "fujifilm",
  "nikon",
  "hasselblad",
  "leica",
  "ong kinh",
  "lens",
  "leu cam trai",
  "snow peak",
  "camping",
  "loa bose",
  "synthesizer",
  "op 1",
  "gimbal",
  "gopro",
  "flycam",
  "dji",
];

const mapRentDocToAIRec = (doc, days = 4, maxBudget = 300000) => {
  const pricePerDay = Number(doc.pricePerDay || doc.rentPrice || 180000);
  const depositAmount = Number(doc.depositAmount || doc.deposit || pricePerDay * 4);
  const isWithinBudget = pricePerDay <= maxBudget;
  const catName =
    typeof doc.categoryId === "object" && doc.categoryId?.name
      ? doc.categoryId.name
      : doc.categoryName || "Thời trang cho thuê";
  const condLabel =
    doc.condition === "NEW"
      ? "Mới 100% (Grade Mint)"
      : doc.condition === "LIKE_NEW"
        ? "Như mới 99% (Grade A+)"
        : doc.condition || "Rất tốt 95% (Grade A)";

  return {
    id: String(doc._id),
    sku: doc.sku || String(doc._id),
    name: doc.name || doc.title || "Trang phục ReUse Hub",
    category: catName,
    brand: doc.shopName || "ReUse Atelier",
    type: "RENT",
    image:
      (Array.isArray(doc.images) && doc.images[0]) ||
      doc.image ||
      "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=600&auto=format&fit=crop&q=80",
    pricePerDay,
    depositAmount,
    originalRetailPrice: depositAmount * 2,
    conditionGrade: condLabel,
    location: doc.location || "Đà Nẵng",
    rating: 4.9,
    reviewCount: 28,
    budgetTag: isWithinBudget ? "Phù hợp ngân sách" : "Thiết kế Cao cấp",
    calculatedDays: days,
    calculatedTotalRent: pricePerDay * days,
    highlights: [
      doc.description || `${doc.name} được tuyển chọn và chăm sóc chuẩn Atelier.`,
      doc.rentalRules
        ? `Lưu ý bảo quản: ${doc.rentalRules}`
        : "Đã giặt hấp khử khuẩn Ozone và niêm phong trước khi giao.",
    ],
    pros: [
      `Sẵn sàng giao từ chi nhánh ${doc.location || "Đà Nẵng"} (${doc.totalQuantity || 1} sản phẩm)`,
      "Tiền cọc được bảo vệ 100% qua hợp đồng thông minh Smart Escrow",
      "Đã khử trùng tia UV-C & giặt hấp chuyên sâu trước khi bàn giao",
    ],
    cons: [
      doc.rentalRules || "Tránh tiếp xúc hóa chất tẩy mạnh hoặc nhiệt độ ủi quá cao",
    ],
    bestFor: "Dự tiệc, sự kiện, chụp hình lookbook & du lịch",
    detailUrl: `/rent/products/${doc._id}`,
  };
};

const mapThriftDocToAIRec = (doc) => {
  const thriftPrice = Number(doc.resalePrice || doc.price || 590000);
  const originalRetailPrice = Number(doc.originalPrice || Math.round(thriftPrice * 2.2));
  const catName =
    typeof doc.categoryId === "object" && doc.categoryId?.name
      ? doc.categoryId.name
      : doc.category || "Thời trang Thanh lý";

  return {
    id: String(doc._id),
    sku: doc.sku || String(doc._id),
    name: doc.name || doc.title || "Trang phục Second-Life",
    category: catName,
    brand: doc.shopName || "ReUse Thrift Atelier",
    type: "THRIFT",
    image:
      (Array.isArray(doc.images) && doc.images[0]) ||
      doc.image ||
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&auto=format&fit=crop&q=80",
    thriftPrice,
    originalRetailPrice,
    conditionGrade: doc.condition || "Như mới (98%)",
    location: doc.location || "Hà Nội",
    rating: 4.8,
    reviewCount: 19,
    budgetTag: "Tiết kiệm Second-Life",
    highlights: [
      doc.description || `${doc.name} thanh lý chính hãng đã qua kiểm định.`,
    ],
    pros: [
      "Tiết kiệm 50% – 70% so với giá mua mới ban đầu",
      `Sẵn sàng giao ngay từ chi nhánh ${doc.location || "Hà Nội"}`,
    ],
    cons: [`Số lượng giới hạn (${doc.quantity || 1} sản phẩm)`],
    bestFor: "Sở hữu lâu dài trong tủ đồ cá nhân với chi phí tối ưu",
    detailUrl: `/thrift/${doc._id}`,
  };
};

/**
 * Tính điểm khớp giữa câu hỏi của người dùng và từng sản phẩm trong DB
 */
const scoreProductAgainstQuery = (doc, rawPrompt) => {
  const normQuery = normalizeVi(rawPrompt);
  const rawLower = String(rawPrompt || "").toLowerCase().trim();
  const docName = String(doc.name || doc.title || "");
  const docDesc = String(doc.description || "");
  const docCat =
    typeof doc.categoryId === "object" && doc.categoryId?.name
      ? doc.categoryId.name
      : String(doc.category || "");

  const normName = normalizeVi(docName);
  const normDesc = normalizeVi(docDesc);
  const normCat = normalizeVi(docCat);
  const nameLower = docName.toLowerCase();

  let score = 0;
  let isExactNameMatch = false;

  // 1. Khớp nguyên tên sản phẩm hoặc cụm tên dài (>= 12 ký tự)
  if (normName && normQuery.includes(normName)) {
    score += 200;
    isExactNameMatch = true;
  } else if (nameLower && rawLower.includes(nameLower)) {
    score += 200;
    isExactNameMatch = true;
  }

  // Kiểm tra các cụm 3-5 từ liên tiếp của tên sản phẩm xuất hiện trong câu hỏi
  const nameWords = normName.split(" ").filter(Boolean);
  if (nameWords.length >= 3) {
    for (let len = Math.min(5, nameWords.length); len >= 3; len--) {
      for (let i = 0; i <= nameWords.length - len; i++) {
        const subPhrase = nameWords.slice(i, i + len).join(" ");
        if (subPhrase.length >= 9 && normQuery.includes(subPhrase)) {
          score += len * 35;
          if (len >= 4) isExactNameMatch = true;
        }
      }
    }
  }

  // 2. Khớp theo nhóm danh mục / dòng sản phẩm cụ thể
  for (const group of CATEGORY_GROUPS) {
    const queryHasGroupPhrase = group.phrases.some((p) => normQuery.includes(p));
    const queryHasGroupToken = group.tokens.some((t) =>
      normQuery.split(" ").includes(t)
    );

    if (queryHasGroupPhrase || queryHasGroupToken) {
      const docMatchesGroup =
        group.phrases.some((p) => normName.includes(p) || normCat.includes(p)) ||
        group.tokens.some(
          (t) =>
            normName.split(" ").includes(t) ||
            normCat.split(" ").includes(t)
        );
      if (docMatchesGroup) {
        score += queryHasGroupPhrase ? 60 : 40;
      } else {
        score -= 60;
      }
    }
  }

  // 3. Khớp từng từ khóa có nghĩa trong câu hỏi (màu sắc, chất liệu, kiểu dáng...)
  const queryTokens = normQuery
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  let matchedTokenCount = 0;
  for (const token of queryTokens) {
    if (normName.split(" ").includes(token)) {
      score += 18;
      matchedTokenCount++;
    } else if (normName.includes(token) && token.length >= 4) {
      score += 12;
      matchedTokenCount++;
    } else if (normCat.includes(token)) {
      score += 10;
      matchedTokenCount++;
    } else if (normDesc.split(" ").includes(token)) {
      score += 6;
      matchedTokenCount++;
    }
  }

  if (queryTokens.length >= 2 && matchedTokenCount === queryTokens.length) {
    score += 45;
  }

  return { score, isExactNameMatch, matchedTokenCount, totalQueryTokens: queryTokens.length };
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
    const rentFilter = { status: "APPROVED" };
    if (keyword) {
      rentFilter.name = { $regex: keyword, $options: "i" };
    }
    const rentDocs = await RentalProduct.find(rentFilter)
      .populate("categoryId", "name slug")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    results.push(...rentDocs.map((d) => mapRentDocToAIRec(d, days, maxBudget)));
  }

  if (type === "ALL" || type === "THRIFT") {
    const thriftFilter = { status: "APPROVED" };
    if (keyword) {
      thriftFilter.name = { $regex: keyword, $options: "i" };
    }
    const thriftDocs = await ThriftListing.find(thriftFilter)
      .populate("categoryId", "name slug")
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
  const rawPrompt = String(prompt || "").trim();
  const q = rawPrompt.toLowerCase();
  const normQ = normalizeVi(rawPrompt);
  const nowTime = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const daysMatch = q.match(/(\d+)\s*ngày/);
  const days = daysMatch
    ? Math.max(1, Number(daysMatch[1]))
    : Number(preferences.travelDaysDefault) || 4;

  // Chỉ lọc cứng theo ngân sách khi người dùng có nhắc tới giá / ngân sách trong câu hỏi
  const kMatch = q.match(/(\d+)\s*k\b/);
  const fullNumMatch = q.match(/(\d{2,3})[.,](\d{3})/);
  const hasExplicitBudget = Boolean(
    kMatch || fullNumMatch || q.includes("ngân sách") || q.includes("dưới ") || q.includes("giá dưới")
  );

  let maxBudget = Number(preferences.maxDailyRentBudget) || 350000;
  if (fullNumMatch) {
    maxBudget = Number(`${fullNumMatch[1]}${fullNumMatch[2]}`);
  } else if (kMatch) {
    maxBudget = Number(kMatch[1]) * 1000;
  }

  // Nhận diện lọc theo chi nhánh kho nếu khách hỏi (Đà Nẵng / Hà Nội / TP.HCM)
  let requestedLocation = null;
  if (normQ.includes("da nang")) requestedLocation = "Đà Nẵng";
  else if (normQ.includes("ha noi")) requestedLocation = "Hà Nội";
  else if (normQ.includes("ho chi minh") || normQ.includes("sai gon") || normQ.includes("tphcm") || normQ.includes("hcm")) {
    requestedLocation = "TP. Hồ Chí Minh";
  }

  // Nạp toàn bộ sản phẩm RENT & THRIFT đang active từ MongoDB để khớp chính xác
  const [allRentDocs, allThriftDocs] = await Promise.all([
    RentalProduct.find({ status: "APPROVED" }).populate("categoryId", "name slug").lean(),
    ThriftListing.find({ status: "APPROVED" }).populate("categoryId", "name slug").lean(),
  ]);

  const findBestMatchingRentDocs = (searchStr) => {
    const scored = allRentDocs
      .map((doc) => ({
        doc,
        ...scoreProductAgainstQuery(doc, searchStr),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const exactMatches = scored.filter((item) => item.isExactNameMatch);
    if (exactMatches.length > 0) {
      return { matches: exactMatches.map((x) => x.doc), isExact: true };
    }
    return { matches: scored.map((x) => x.doc), isExact: false };
  };

  const findBestMatchingThriftDocs = (searchStr) => {
    const scored = allThriftDocs
      .map((doc) => ({
        doc,
        ...scoreProductAgainstQuery(doc, searchStr),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const exactMatches = scored.filter((item) => item.isExactNameMatch);
    if (exactMatches.length > 0) {
      return { matches: exactMatches.map((x) => x.doc), isExact: true };
    }
    return { matches: scored.map((x) => x.doc), isExact: false };
  };

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
          "Tìm đầm dự tiệc sang trọng dưới 250.000đ/ngày",
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
        productName: o.items?.[0]?.productName || "Trang phục thuê ReUse Hub",
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
          : "Hoàn tự động ngay sau khi xưởng hoàn tất đối kiểm khi trả đồ.",
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
        "Tìm đầm dạ hội đi tiệc 3 ngày dưới 250.000đ/ngày",
      ],
    };
  }

  // 1B. Giải đáp CÁCH THUÊ ĐỒ / QUY TRÌNH THUÊ & TRẢ ĐỒ / CHÍNH SÁCH CỌC / CLA / SHIP (Chỉ trả lời văn bản hướng dẫn, KHÔNG gửi sản phẩm)
  const hasHowOrGuide =
    normQ.includes("huong dan") ||
    normQ.includes("cach") ||
    normQ.includes("quy trinh") ||
    normQ.includes("lam sao") ||
    normQ.includes("lam the nao") ||
    normQ.includes("nhu the nao") ||
    normQ.includes("the nao") ||
    normQ.includes("chi toi") ||
    normQ.includes("chi minh") ||
    normQ.includes("chi em") ||
    normQ.includes("cho toi biet") ||
    normQ.includes("cac buoc") ||
    normQ.includes("thu tuc");

  const isHowToRentQuestion =
    (hasHowOrGuide && (normQ.includes("thue") || normQ.includes("muon"))) ||
    normQ.includes("cach thue") ||
    normQ.includes("thue do nhu the nao") ||
    normQ.includes("thue nhu the nao") ||
    normQ.includes("thue the nao") ||
    normQ.includes("lam sao de thue") ||
    normQ.includes("lam the nao de thue") ||
    normQ.includes("huong dan thue") ||
    normQ.includes("quy trinh thue") ||
    normQ.includes("cac buoc thue") ||
    normQ.includes("muon thue do thi") ||
    normQ.includes("dat thue nhu the nao") ||
    normQ.includes("thu tuc thue");

  if (isHowToRentQuestion) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Hướng dẫn quy trình thuê đồ trên ReUse Hub",
      bannerSubtitle: "Chỉ với 4 bước đơn giản, minh bạch và bảo vệ 100% tiền cọc.",
      text:
        "Để thuê trang phục trên **ReUse Hub**, bạn chỉ cần thực hiện theo **4 bước** sau:\n\n" +
        "**Bước 1 — Chọn trang phục & Lịch thuê:**\n" +
        "• Vào mục **RENT Marketplace**, chọn mẫu trang phục bạn ưng ý.\n" +
        "• Chọn kích cỡ (Size), ngày bắt đầu nhận đồ và số ngày muốn thuê.\n\n" +
        "**Bước 2 — Đặt đơn & Khóa cọc Smart Escrow:**\n" +
        "• Tiến hành thanh toán **Tiền thuê + Tiền đặt cọc bảo chứng**.\n" +
        "• Khoản tiền cọc của bạn được khóa an toàn trong hợp đồng **Smart Escrow** của hệ thống (Chủ shop không thể tự ý rút).\n\n" +
        "**Bước 3 — Nhận đồ & Đồng kiểm CLA:**\n" +
        "• Trang phục được giặt hấp khử trùng tia UV-C và giao tận nơi.\n" +
        "• Khi nhận hàng, bạn kiểm tra đồ và chụp 3 góc xác nhận biên bản điện tử **CLA** để bảo vệ quyền lợi khỏi các lỗi có sẵn.\n\n" +
        "**Bước 4 — Trả đồ & Hoàn cọc 100% tự động:**\n" +
        "• Mặc xong bạn **không cần tự giặt**, chỉ cần bấm **\"Yêu cầu trả đồ\"** trong mục Đơn hàng.\n" +
        "• Ngay khi xưởng nghiệm thu xong, **100% tiền đặt cọc** sẽ được hoàn tự động về Ví khả dụng của bạn!",
      recommendations: [],
      quickFollowUps: [
        "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
        "Nếu trả đồ sớm hoặc trễ lịch hẹn thì tính phí thế nào?",
        "Tìm đầm dạ hội dự tiệc sang trọng",
      ],
    };
  }

  const isHowToBuyThriftQuestion =
    (hasHowOrGuide &&
      (normQ.includes("mua") || normQ.includes("dat hang") || normQ.includes("order")) &&
      (normQ.includes("thrift") ||
        normQ.includes("thanh ly") ||
        normQ.includes("second life") ||
        normQ.includes("do cu") ||
        normQ.includes("mua dut"))) ||
    normQ.includes("cach mua") ||
    normQ.includes("huong dan mua") ||
    normQ.includes("quy trinh mua") ||
    normQ.includes("mua nhu the nao") ||
    normQ.includes("mua the nao") ||
    normQ.includes("mua do nhu the nao") ||
    normQ.includes("mua thanh ly the nao") ||
    normQ.includes("lam sao de mua");

  if (isHowToBuyThriftQuestion) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Hướng dẫn mua đồ thanh lý (THRIFT) trên ReUse Hub",
      bannerSubtitle: "Sở hữu trang phục Second-Life chuẩn kiểm định tiết kiệm 50% – 70%.",
      text:
        "Cách mua đứt trang phục tại sàn **THRIFT Marketplace** rất đơn giản:\n\n" +
        "• **Bước 1:** Vào mục **THRIFT**, chọn món đồ bạn yêu thích và xem kỹ thông số độ mới (Grade A+ / Như mới 98%-99%).\n" +
        "• **Bước 2:** Thêm vào giỏ hàng và thanh toán trực tiếp (**Không cần đặt cọc** như khi thuê đồ).\n" +
        "• **Bước 3:** Nhận hàng tận nơi, được quyền đồng kiểm chất lượng đúng như mô tả kiểm định trước khi xác nhận hoàn tất đơn!",
      recommendations: [],
      quickFollowUps: [
        "Khi nào nên thuê (RENT) và khi nào nên mua (THRIFT)?",
        "Cách thuê đồ như thế nào?",
        "Cho mình xem các mẫu đồ thanh lý THRIFT hiện có",
      ],
    };
  }

  const isPolicyOrFaqQuestion =
    normQ.includes("quy trinh yeu cau tra do") ||
    normQ.includes("quy trinh tra do") ||
    normQ.includes("cach tra do") ||
    normQ.includes("tra do the nao") ||
    normQ.includes("tra do nhu the nao") ||
    normQ.includes("khi nao toi duoc hoan") ||
    normQ.includes("khi nao duoc hoan") ||
    normQ.includes("khi nao hoan") ||
    normQ.includes("bao lau duoc hoan") ||
    normQ.includes("bao lau thi hoan") ||
    normQ.includes("hoan coc") ||
    normQ.includes("tra coc") ||
    (normQ.includes("tien coc") &&
      (normQ.includes("bao lau") ||
        normQ.includes("khi nao") ||
        normQ.includes("the nao") ||
        normQ.includes("nhu the nao") ||
        normQ.includes("la gi") ||
        normQ.includes("hoan") ||
        normQ.includes("giu") ||
        normQ.includes("co mat khong"))) ||
    normQ.includes("smart escrow la gi") ||
    normQ.includes("co che bao ve tien coc") ||
    normQ.includes("bien ban dong kiem") ||
    normQ.includes("cla 3 goc") ||
    normQ.includes("cla la gi") ||
    normQ.includes("tra do som") ||
    normQ.includes("tra do tre") ||
    normQ.includes("tra muon") ||
    normQ.includes("qua han") ||
    normQ.includes("co can giat") ||
    normQ.includes("lam ban") ||
    normQ.includes("rach do") ||
    normQ.includes("hu hong") ||
    normQ.includes("doi size") ||
    normQ.includes("mac khong vua") ||
    normQ.includes("phi van chuyen") ||
    normQ.includes("phi ship") ||
    normQ.includes("cach tinh tien thue") ||
    normQ.includes("dia chi shop") ||
    normQ.includes("chi nhanh o dau") ||
    normQ.includes("shop o dau");

  if (isPolicyOrFaqQuestion) {
    if (normQ.includes("tra do som") || normQ.includes("tra do tre") || normQ.includes("tra muon") || normQ.includes("qua han")) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Chính sách Trả đồ Sớm hạn & Trễ hạn",
        bannerSubtitle: "Linh hoạt và minh bạch theo từng ngày sử dụng thực tế.",
        text:
          "Dưới đây là quy định khi bạn trả đồ sớm hoặc trễ hơn lịch hẹn trên **ReUse Hub**:\n\n" +
          "• **Khi trả đồ sớm hơn lịch hẹn:** Nếu bạn hoàn trả trang phục sớm ít nhất **24 giờ** so với ngày kết thúc hợp đồng, hệ thống sẽ hoàn lại **50% tiền thuê của những ngày chưa sử dụng** cùng với 100% tiền đặt cọc.\n" +
          "• **Khi cần gia hạn hoặc trả đồ trễ:** Bạn có thể bấm **\"Gia hạn thuê\"** ngay trên chi tiết đơn hàng trước khi hết hạn để giữ mức giá ưu đãi. Nếu trả trễ mà không báo trước, phí quá hạn được tính bằng **120% đơn giá thuê/ngày** cho mỗi ngày trễ.",
        recommendations: [],
        quickFollowUps: [
          "Cách thuê đồ như thế nào?",
          "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
        ],
      };
    }

    if (normQ.includes("bien ban dong kiem") || normQ.includes("cla")) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Biên bản đồng kiểm CLA 3 góc là gì?",
        bannerSubtitle: "Bảo vệ tuyệt đối quyền lợi người thuê khỏi mọi tranh chấp.",
        text:
          "**CLA (Condition Level Agreement)** là biên bản điện tử ghi nhận tình trạng trang phục trước và sau khi thuê:\n\n" +
          "• **1. Trước khi giao:** Xưởng chụp ảnh 3 góc (Mặt trước, Mặt sau, Tem/Chi tiết khóa kéo) và niêm phong túi đồ.\n" +
          "• **2. Khi bạn nhận hàng:** Bạn kiểm tra sản phẩm và xác nhận tình trạng trên ứng dụng. Nếu phát hiện vết xước hay lỗi nhỏ nào có sẵn, bạn ghi chú ngay vào biên bản CLA để **không bao giờ bị tính lỗi khi trả đồ**.\n" +
          "• **3. Khi trả đồ:** Xưởng đối chiếu đúng với biên bản CLA ban đầu để giải ngân hoàn cọc 100% ngay lập tức.",
        recommendations: [],
        quickFollowUps: [
          "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
          "Cách thuê đồ như thế nào?",
        ],
      };
    }

    if (normQ.includes("co can giat") || normQ.includes("lam ban") || normQ.includes("hu hong") || normQ.includes("rach do")) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Chính sách Giặt hấp & Bảo quản trang phục thuê",
        bannerSubtitle: "Miễn phí 100% chi phí giặt hấp & khử khuẩn sau khi mặc.",
        text:
          "Bạn hoàn toàn yên tâm khi sử dụng trang phục tại **ReUse Hub**:\n\n" +
          "• **Không cần tự giặt trước khi trả:** Chi phí thuê đã bao gồm 100% gói giặt hấp chuyên sâu và khử trùng tia UV-C tại xưởng. Bạn tuyệt đối không nên tự giặt máy hoặc ủi nhiệt độ cao tại nhà để tránh làm hỏng phom vải.\n" +
          "• **Vết bẩn thông thường:** Các vết bẩn nhẹ do ăn uống, bụi bẩn khi đi tiệc được xưởng xử lý **hoàn toàn miễn phí**, không trừ cọc.\n" +
          "• **Hư hỏng nặng:** Chỉ khi trang phục bị rách lớn, cháy xém hoặc mất phụ kiện đi kèm mới khấu trừ chi phí phục hồi thực tế theo bảng giá niêm yết.",
        recommendations: [],
        quickFollowUps: [
          "Cách thuê đồ như thế nào?",
          "Biên bản đồng kiểm CLA 3 góc khi nhận hàng là gì?",
        ],
      };
    }

    if (normQ.includes("phi van chuyen") || normQ.includes("phi ship") || normQ.includes("dia chi") || normQ.includes("chi nhanh") || normQ.includes("shop o dau") || normQ.includes("doi size") || normQ.includes("mac khong vua")) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Hệ thống Chi nhánh, Vận chuyển & Hỗ trợ Đổi Size",
        bannerSubtitle: "Giao nhận 2 chiều tại Đà Nẵng, Hà Nội và TP. Hồ Chí Minh.",
        text:
          "Thông tin chi nhánh và dịch vụ giao nhận của **ReUse Hub**:\n\n" +
          "• **Hệ thống 3 kho lưu ký:** Đà Nẵng, Hà Nội và TP. Hồ Chí Minh.\n" +
          "• **Phí vận chuyển 2 chiều:** Nội tỉnh chỉ **30.000đ** (nhận trong ngày hoặc 24h), liên tỉnh **55.000đ**.\n" +
          "• **Chính sách đổi Size:** Nếu nhận đồ thử không vừa, bạn chỉ cần báo trong vòng **4 giờ** kể từ lúc nhận hàng để được hỗ trợ đổi sang Size khác hoàn toàn miễn phí tiền thuê!",
        recommendations: [],
        quickFollowUps: [
          "Cách thuê đồ như thế nào?",
          "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
        ],
      };
    }

    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Cơ chế Bảo vệ Tiền cọc Smart Escrow & Hoàn cọc 100%",
      bannerSubtitle: "Minh bạch, tự động và an toàn tuyệt đối cho khách hàng.",
      text:
        "Dưới đây là quy trình tính phí, giữ cọc và hoàn cọc trên **ReUse Hub**:\n\n" +
        "• **1. Cách tính tổng thanh toán tạm giữ:** `Tổng tạm giữ = (Giá thuê/ngày × Số ngày) + Phí vận chuyển + Tiền đặt cọc`.\n" +
        "• **2. Bảo vệ tiền cọc qua Smart Escrow:** Tiền cọc của bạn **không chuyển thẳng cho chủ shop** mà được khóa bảo chứng trên hệ thống Smart Escrow.\n" +
        "• **3. Khi nào hoàn lại 100% tiền cọc?** Ngay khi bạn bấm **\"Yêu cầu trả đồ\"**, shipper thu hồi về kho và xưởng xác nhận nghiệm thu theo biên bản CLA, **100% tiền đặt cọc được giải tỏa tự động về Ví khả dụng** của bạn trong vòng 5–15 phút (bạn có thể rút về ngân hàng bất cứ lúc nào).",
      recommendations: [],
      quickFollowUps: [
        "Cách thuê đồ như thế nào?",
        "Biên bản đồng kiểm CLA 3 góc khi nhận hàng là gì?",
        "Nếu trả đồ sớm hơn lịch hẹn thì tính phí sao?",
      ],
    };
  }

  // 2. Tư vấn bài toán Nên Thuê (RENT) hay Mua thanh lý (THRIFT)
  if (
    q.includes("nên thuê hay mua") ||
    q.includes("thuê hay mua") ||
    q.includes("rent vs thrift") ||
    (q.includes("khi nào nên") && q.includes("thrift"))
  ) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Tư vấn kinh tế: Nên Thuê (RENT) hay Mua thanh lý (THRIFT)?",
      bannerSubtitle: "Tối ưu ngân sách thời trang theo tần suất mặc thực tế của bạn.",
      text: "Quy tắc vàng trên ReUse Hub: Nếu bạn cần trang phục cho dịp đặc biệt (dự tiệc, đám cưới, chụp ảnh) chỉ mặc 1–2 lần, hãy chọn **RENT**. Nếu là trang phục mặc thường xuyên (blazer, áo khoác, chân váy), mua Second-Life tại sàn **THRIFT** sẽ tiết kiệm 50%–70%:",
      comparison: {
        title: "Đặt lên bàn cân: Thuê ngắn hạn (RENT) vs Mua thanh lý (THRIFT)",
        leftTitle: "Thuê trang phục (RENT)",
        rightTitle: "Mua thanh lý (THRIFT)",
        rows: [
          {
            criteria: "Dịp sử dụng phù hợp",
            leftValue: "Đầm dạ hội, Suit cưới, Đồ sự kiện (mặc 1–3 ngày)",
            rightValue: "Blazer, Trench coat, Đồ mặc hàng tuần",
          },
          {
            criteria: "Chi phí bỏ ra",
            leftValue: "Chỉ 8% – 15% giá trị món đồ",
            rightValue: "Tiết kiệm 50% – 70% so với mua mới",
          },
          {
            criteria: "Giặt hấp & Bảo quản",
            leftValue: "0đ (Xưởng lo 100% giặt hấp & khử khuẩn Ozone)",
            rightValue: "Sở hữu vĩnh viễn, đã kiểm định chất lượng",
          },
        ],
        verdict:
          "Chọn RENT cho trang phục dạ hội/sự kiện ngắn ngày để luôn diện đồ mới không lo giặt ủi; chọn THRIFT cho các thiết kế kinh điển mặc quanh năm.",
      },
      recommendations: [],
      quickFollowUps: [
        "Cách thuê đồ như thế nào?",
        "Tìm đầm dạ hội dự tiệc dưới 250.000đ/ngày",
        "Xem các mẫu quần áo thanh lý THRIFT hiện có",
      ],
    };
  }

  // 3. So sánh sản phẩm ("so sánh A và B")
  if (q.includes("so sánh")) {
    let leftDoc = null;
    let rightDoc = null;

    // Nếu câu hỏi tách bằng "và" hoặc "với" hoặc "vs"
    const splitParts = rawPrompt
      .replace(/so sánh( ưu nhược điểm| chi tiết)?/i, "")
      .split(/\s+(?:và|với|vs|hay)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    if (splitParts.length >= 2) {
      const leftMatches = findBestMatchingRentDocs(splitParts[0]).matches;
      const rightMatches = findBestMatchingRentDocs(splitParts[1]).matches;
      leftDoc = leftMatches[0] || null;
      rightDoc = rightMatches.find((d) => String(d._id) !== String(leftDoc?._id)) || null;
    }

    if (!leftDoc || !rightDoc) {
      const { matches } = findBestMatchingRentDocs(rawPrompt);
      if (matches.length >= 2) {
        leftDoc = leftDoc || matches[0];
        rightDoc = rightDoc || matches.find((d) => String(d._id) !== String(leftDoc?._id));
      } else if (matches.length === 1) {
        leftDoc = matches[0];
        rightDoc =
          allRentDocs.find(
            (d) =>
              String(d._id) !== String(leftDoc._id) &&
              String(d.categoryId?._id || d.categoryId) === String(leftDoc.categoryId?._id || leftDoc.categoryId)
          ) || allRentDocs.find((d) => String(d._id) !== String(leftDoc._id));
      }
    }

    if (!leftDoc && activeProductId && /^[0-9a-fA-F]{24}$/.test(String(activeProductId))) {
      leftDoc = allRentDocs.find((d) => String(d._id) === String(activeProductId)) || null;
      if (leftDoc) {
        rightDoc =
          allRentDocs.find(
            (d) =>
              String(d._id) !== String(leftDoc._id) &&
              String(d.categoryId?._id || d.categoryId) === String(leftDoc.categoryId?._id || leftDoc.categoryId)
          ) || allRentDocs.find((d) => String(d._id) !== String(leftDoc._id));
      }
    }

    if (!leftDoc) leftDoc = allRentDocs[0];
    if (!rightDoc) rightDoc = allRentDocs[1] || allRentDocs[0];

    if (leftDoc && rightDoc) {
      const leftRec = mapRentDocToAIRec(leftDoc, days, maxBudget);
      const rightRec = mapRentDocToAIRec(rightDoc, days, maxBudget);

      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Phân tích & So sánh trực diện từ ReUse AI",
        bannerSubtitle: `So sánh chi tiết trong chu kỳ thuê ${days} ngày từ dữ liệu kho thực tế.`,
        text: `Mình đặt lên bàn cân 2 sản phẩm **${leftRec.name}** và **${rightRec.name}** để bạn dễ dàng lựa chọn:`,
        comparison: {
          title: `So sánh chi tiết (${days} ngày thuê)`,
          leftTitle: leftRec.name,
          rightTitle: rightRec.name,
          rows: [
            {
              criteria: "Danh mục",
              leftValue: leftRec.category,
              rightValue: rightRec.category,
            },
            {
              criteria: "Giá thuê / ngày",
              leftValue: `${formatVND(leftRec.pricePerDay)}/ngày`,
              rightValue: `${formatVND(rightRec.pricePerDay)}/ngày`,
            },
            {
              criteria: `Tổng thuê ${days} ngày`,
              leftValue: formatVND(leftRec.calculatedTotalRent),
              rightValue: formatVND(rightRec.calculatedTotalRent),
            },
            {
              criteria: "Tiền cọc Escrow",
              leftValue: `${formatVND(leftRec.depositAmount)} (Hoàn 100%)`,
              rightValue: `${formatVND(rightRec.depositAmount)} (Hoàn 100%)`,
            },
            {
              criteria: "Tình trạng & Kho",
              leftValue: `${leftRec.conditionGrade} · ${leftRec.location}`,
              rightValue: `${rightRec.conditionGrade} · ${rightRec.location}`,
            },
          ],
          verdict:
            leftRec.pricePerDay <= rightRec.pricePerDay
              ? `${leftRec.name} có mức giá thuê tiết kiệm hơn (${formatVND(leftRec.pricePerDay)}/ngày), trong khi ${rightRec.name} mang phong cách nổi bật riêng tại kho ${rightRec.location}.`
              : `${rightRec.name} tối ưu ngân sách hơn (${formatVND(rightRec.pricePerDay)}/ngày), còn ${leftRec.name} là lựa chọn cao cấp rất đáng trải nghiệm.`,
        },
        recommendations: [leftRec, rightRec],
        quickFollowUps: [
          `Tính tổng chi phí thuê ${leftRec.name} trong ${days} ngày`,
          `Tính tổng chi phí thuê ${rightRec.name} trong ${days} ngày`,
        ],
      };
    }
  }

  // 4. Tính chi phí thuê, vận chuyển 2 chiều theo địa chỉ & tiền cọc (Chỉ hiện bảng tính chi phí, không tự gửi kèm thẻ sản phẩm)
  if (
    q.includes("tính chi phí") ||
    q.includes("tổng chi phí") ||
    q.includes("dự toán") ||
    (q.includes("giải thích") && (q.includes("chi phí") || q.includes("tiền cọc") || q.includes("escrow")))
  ) {
    let targetDoc = null;

    // Ưu tiên tìm sản phẩm được nhắc tên trực tiếp trong câu hỏi
    const { matches } = findBestMatchingRentDocs(rawPrompt);
    if (matches.length > 0) {
      targetDoc = matches[0];
    } else if (activeProductId && /^[0-9a-fA-F]{24}$/.test(String(activeProductId))) {
      targetDoc = allRentDocs.find((d) => String(d._id) === String(activeProductId)) || null;
    }
    if (!targetDoc) {
      targetDoc = allRentDocs[0] || null;
    }

    if (targetDoc) {
      const mapped = mapRentDocToAIRec(targetDoc, days, maxBudget);
      const userLocation = user?.address?.province || preferences.preferredLocation || "Đà Nẵng";
      const shippingFee = calculateShippingFee(mapped.location || "Đà Nẵng", userLocation);
      const rentalSubtotal = mapped.pricePerDay * days;

      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: `Bảng ước tính & Giải thích chi phí (${days} ngày)`,
        bannerSubtitle: "Minh bạch 100% · Tự động tính phí vận chuyển theo chi nhánh.",
        text: `Mình bóc tách chi tiết từng khoản khi bạn thuê **${mapped.name}** (Kho ${mapped.location}) trong ${days} ngày:`,
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
            `Chi phí thực tế tiêu dùng: ${formatVND(rentalSubtotal + shippingFee)} (Tiền thuê + Phí giao nhận từ kho ${mapped.location}).`,
            `Khoản đặt cọc ${formatVND(mapped.depositAmount)} được khóa bảo chứng an toàn trong Smart Escrow.`,
            "Ngay khi trả đồ và nghiệm thu đạt chuẩn, 100% tiền cọc được hoàn tự động về Ví khả dụng của bạn.",
          ],
        },
        recommendations: [],
        quickFollowUps: [
          "Cách thuê đồ như thế nào?",
          "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
        ],
      };
    }
  }

  // 5. Nếu người dùng hỏi đồ điện tử / máy ảnh / lều cắm trại (không thuộc ngành hàng thời trang)
  const askedNonFashion = NON_FASHION_KEYWORDS.some((kw) => normQ.includes(kw));
  if (askedNonFashion) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Hiện tại ReUse Hub chuyên về Thời trang, Đầm dự tiệc, Giày dép & Phụ kiện!",
      bannerSubtitle: "Các mặt hàng điện tử / máy ảnh đã ngừng kinh doanh trên hệ thống.",
      text: "Hiện tại sàn ReUse Hub tập trung 100% vào các bộ sưu tập **Quần áo thiết kế, Đầm dạ hội, Suit/Vest, Giày dép và Phụ kiện trang sức**. Nếu bạn muốn xem thử các mẫu trang phục này, hãy nhắn tên món đồ bạn cần tìm nhé!",
      recommendations: [],
      quickFollowUps: [
        "Tìm đầm dạ hội dự tiệc sang trọng",
        "Cho mình xem các mẫu giày cao gót và sneaker",
        "Tìm áo khoác dạ hoặc blazer",
      ],
    };
  }

  // 6. Tư vấn sản phẩm THRIFT (khi câu hỏi nhắc tới tìm/xem đồ thrift / thanh lý / mua đứt)
  const isThriftIntent =
    (q.includes("thrift") ||
      q.includes("thanh lý") ||
      q.includes("mua đứt") ||
      q.includes("second-life")) &&
    (normQ.includes("tim") ||
      normQ.includes("goi y") ||
      normQ.includes("xem") ||
      normQ.includes("tu van") ||
      normQ.includes("mau nao") ||
      normQ.includes("san pham") ||
      normQ.includes("trang phuc") ||
      normQ.includes("mon do") ||
      hasSpecificCategoryMention);

  if (isThriftIntent) {
    // Nếu khách hỏi câu hỏi thông tin về đồ thanh lý (vd: "đồ second-life có đảm bảo chất lượng không?") mà KHÔNG bảo tìm/gợi ý sản phẩm
    const isThriftInfoQuestion =
      (normQ.includes("co dam bao") ||
        normQ.includes("chat luong khong") ||
        normQ.includes("la gi") ||
        normQ.includes("nhu the nao") ||
        normQ.includes("the nao") ||
        normQ.includes("co doi tra")) &&
      !normQ.includes("tu van cac") &&
      !normQ.includes("goi y") &&
      !normQ.includes("tim") &&
      !normQ.includes("xem");

    if (isThriftInfoQuestion) {
      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: "Chất lượng & Kiểm định đồ Second-Life (THRIFT)",
        bannerSubtitle: "Cam kết minh bạch nguồn gốc và độ mới từ 95% – 99%.",
        text:
          "Toàn bộ trang phục tại sàn **THRIFT Marketplace** đều trải qua quy trình kiểm định 3 bước nghiêm ngặt:\n\n" +
          "• **1. Tuyển chọn phom dáng & chất liệu:** Chỉ nhận các thiết kế đạt độ mới từ **Grade A đến Grade A+ (95% – 99%)**, không sờn rách hay phai màu.\n" +
          "• **2. Giặt hấp & Khử khuẩn Ozone:** Tiệt trùng hoàn toàn trước khi đóng gói giao tới tay bạn.\n" +
          "• **3. Bảo vệ người mua:** Bạn được kiểm tra hàng khi nhận. Nếu sản phẩm không đúng mô tả kiểm định, hệ thống hoàn tiền 100% ngay lập tức!",
        recommendations: [],
        quickFollowUps: [
          "Cách mua đồ thanh lý như thế nào?",
          "Tư vấn các mẫu quần áo thanh lý THRIFT đáng mua nhất hiện nay",
        ],
      };
    }

    const { matches: matchedThrift, isExact } = findBestMatchingThriftDocs(rawPrompt);
    const chosenThrift =
      matchedThrift.length > 0
        ? isExact
          ? matchedThrift.slice(0, 2)
          : matchedThrift.slice(0, 4)
        : allThriftDocs.slice(0, 4);

    const thriftRecs = chosenThrift.map((d) => mapThriftDocToAIRec(d));

    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle:
        matchedThrift.length > 0 && isExact
          ? `Tìm thấy đúng sản phẩm THRIFT: ${thriftRecs[0].name}`
          : "Gợi ý trang phục THRIFT (Second-Life) chuẩn kiểm định!",
      bannerSubtitle: "Dữ liệu trực tiếp từ kho thanh lý thời trang ReUse Hub.",
      text:
        matchedThrift.length > 0
          ? `Mình tìm thấy ${thriftRecs.length} sản phẩm thanh lý phù hợp đúng với yêu cầu của bạn:`
          : "Các thiết kế thời trang thanh lý dưới đây đã qua kiểm định chất lượng minh bạch với mức giá tiết kiệm 50% – 70%:",
      recommendations: thriftRecs,
      quickFollowUps: [
        "Khi nào nên mua đồ THRIFT thay vì thuê RENT?",
        "Tìm đầm dạ hội cho thuê ngắn ngày",
      ],
    };
  }

  // 7. Tìm kiếm chính xác sản phẩm theo Tên hoặc Danh mục / Từ khóa trong câu hỏi (Cả RENT & THRIFT)
  // Lưu ý: Không trả về sản phẩm nếu câu hỏi mang tính hỏi thủ tục/cách thức ("như thế nào", "làm sao", "quy trình", "cần giấy tờ gì"...) mà không nhắc tới tên/loại trang phục cụ thể
  const isProceduralQuestion =
    normQ.includes("nhu the nao") ||
    normQ.includes("lam sao") ||
    normQ.includes("lam the nao") ||
    normQ.includes("quy trinh") ||
    normQ.includes("thu tuc") ||
    normQ.includes("giay to") ||
    normQ.includes("cccd") ||
    normQ.includes("cmnd") ||
    normQ.includes("thanh toan") ||
    normQ.includes("huy don") ||
    normQ.includes("chinh sach");

  const hasSpecificCategoryMention = CATEGORY_GROUPS.some(
    (g) =>
      g.phrases.some((p) => normQ.includes(p)) ||
      g.tokens.some((t) => normQ.split(" ").includes(t))
  );

  if (!isProceduralQuestion || hasSpecificCategoryMention) {
    const { matches: rentMatches, isExact: isExactRent } = findBestMatchingRentDocs(rawPrompt);
    const { matches: thriftMatches, isExact: isExactThrift } = findBestMatchingThriftDocs(rawPrompt);

    // Nếu khớp chính xác tên sản phẩm bên RENT
    if (isExactRent && rentMatches.length > 0) {
      const exactDocs = rentMatches.slice(0, 2);
      const mappedExact = exactDocs.map((d) => mapRentDocToAIRec(d, days, maxBudget));
      const mainProd = mappedExact[0];

      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: `Thông tin chi tiết: ${mainProd.name}`,
        bannerSubtitle: `Danh mục: ${mainProd.category} · ${mainProd.conditionGrade} · Kho ${mainProd.location}`,
        text:
          `Mình tìm thấy đúng sản phẩm **${mainProd.name}** bạn đang hỏi:\n` +
          `• **Giá thuê:** ${formatVND(mainProd.pricePerDay)}/ngày (${days} ngày: ${formatVND(mainProd.calculatedTotalRent)})\n` +
          `• **Tiền cọc Smart Escrow:** ${formatVND(mainProd.depositAmount)} (Hoàn 100% khi trả đồ)\n` +
          `• **Chi nhánh:** ${mainProd.location}\n` +
          `• **Mô tả:** ${exactDocs[0].description || "Trang phục chuẩn kiểm định ReUse Hub."}\n` +
          (exactDocs[0].rentalRules ? `• **Quy tắc bảo quản:** ${exactDocs[0].rentalRules}` : ""),
        recommendations: mappedExact,
        quickFollowUps: [
          `Tính tổng chi phí thuê ${mainProd.name} trong ${days} ngày`,
          `So sánh ${mainProd.name} với mẫu cùng phân khúc`,
        ],
      };
    }

    // Nếu khớp chính xác tên sản phẩm bên THRIFT (dù người dùng không gõ chữ "thrift")
    if (isExactThrift && thriftMatches.length > 0) {
      const exactDocs = thriftMatches.slice(0, 2);
      const mappedExact = exactDocs.map((d) => mapThriftDocToAIRec(d));
      const mainProd = mappedExact[0];

      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: `Thông tin sản phẩm Thanh lý (THRIFT): ${mainProd.name}`,
        bannerSubtitle: `Tình trạng: ${mainProd.conditionGrade} · Kho ${mainProd.location}`,
        text:
          `Mình tìm thấy đúng mẫu **${mainProd.name}** tại sàn Thanh lý (THRIFT):\n` +
          `• **Giá mua đứt:** ${formatVND(mainProd.thriftPrice)} (Giá gốc: ${formatVND(mainProd.originalRetailPrice)})\n` +
          `• **Tình trạng:** ${mainProd.conditionGrade}\n` +
          `• **Chi nhánh:** ${mainProd.location}\n` +
          `• **Mô tả:** ${exactDocs[0].description || "Sản phẩm Second-Life chính hãng."}`,
        recommendations: mappedExact,
        quickFollowUps: [
          "Xem thêm các mẫu đồ thanh lý THRIFT khác",
          "Khi nào nên thuê (RENT) và khi nào nên mua (THRIFT)?",
        ],
      };
    }

    // Nếu người dùng đang ở trang chi tiết sản phẩm và hỏi "sản phẩm này" / "ưu nhược điểm"
    if (
      activeProductId &&
      /^[0-9a-fA-F]{24}$/.test(String(activeProductId)) &&
      (q.includes("sản phẩm này") || q.includes("mẫu này") || q.includes("đánh giá") || q.includes("ưu nhược") || q.includes("ưu/nhược"))
    ) {
      const activeRentDoc = allRentDocs.find((d) => String(d._id) === String(activeProductId));
      if (activeRentDoc) {
        const mapped = mapRentDocToAIRec(activeRentDoc, days, maxBudget);
        return {
          id: `ai-${Date.now()}`,
          sender: "ai",
          timestamp: nowTime,
          bannerTitle: `Đánh giá chi tiết: ${mapped.name}`,
          bannerSubtitle: `${mapped.conditionGrade} · Chi nhánh ${mapped.location}`,
          text:
            `Đánh giá từ ReUse AI cho **${mapped.name}**:\n` +
            `• **Mô tả:** ${activeRentDoc.description}\n` +
            `• **Ưu điểm:** ${mapped.pros.join("; ")}\n` +
            `• **Lưu ý bảo quản:** ${mapped.cons.join("; ")}`,
          recommendations: [],
          quickFollowUps: [
            `Tính tổng chi phí thuê ${mapped.name} trong ${days} ngày`,
            `So sánh ${mapped.name} với sản phẩm khác`,
          ],
        };
      }
    }

    // Nếu khớp theo nhóm sản phẩm / từ khóa (ví dụ: "đầm dạ hội", "giày cao gót", "áo dài", "suit", "áo len", "bông tai"...)
    if (rentMatches.length > 0 || thriftMatches.length > 0) {
      let filteredRentMatches = rentMatches;
      if (requestedLocation) {
        const byLoc = filteredRentMatches.filter((d) => d.location === requestedLocation);
        if (byLoc.length > 0) filteredRentMatches = byLoc;
      }
      if (hasExplicitBudget) {
        const byBudget = filteredRentMatches.filter((d) => Number(d.pricePerDay || 0) <= maxBudget);
        if (byBudget.length > 0) filteredRentMatches = byBudget;
      }

      const mappedRent = filteredRentMatches
        .slice(0, 4)
        .map((d) => mapRentDocToAIRec(d, days, maxBudget));

      const mappedThrift =
        mappedRent.length < 4 && thriftMatches.length > 0
          ? thriftMatches.slice(0, 4 - mappedRent.length).map((d) => mapThriftDocToAIRec(d))
          : [];

      const combined = [...mappedRent, ...mappedThrift];
      const firstProd = combined[0];

      return {
        id: `ai-${Date.now()}`,
        sender: "ai",
        timestamp: nowTime,
        bannerTitle: `Tìm thấy ${combined.length} sản phẩm đúng với yêu cầu của bạn!`,
        bannerSubtitle: requestedLocation
          ? `Ưu tiên lọc tại chi nhánh ${requestedLocation} từ cơ sở dữ liệu.`
          : "Đã lọc theo đúng dòng sản phẩm bạn tìm kiếm trên MongoDB.",
        text: `Dưới đây là các sản phẩm phù hợp nhất với yêu cầu **"${rawPrompt}"** hiện có sẵn trong kho:`,
        recommendations: combined,
        quickFollowUps: firstProd
          ? [
              `Tính tổng chi phí thuê ${firstProd.name} trong ${days} ngày`,
              `Đánh giá ưu/nhược điểm của ${firstProd.name}`,
              "Nên thuê ngắn hạn hay mua thanh lý THRIFT?",
            ]
          : [
              "Tìm đầm dạ hội dự tiệc",
              "Tìm giày cao gót và sneaker",
            ],
      };
    }
  }

  // 8. Kiểm tra xem người dùng có thực sự yêu cầu TÌM / GỢI Ý SẢN PHẨM chung chung hay không (ví dụ: "tìm đồ đi tiệc 4 ngày dưới 300k/ngày", "gợi ý trang phục")
  const hasExplicitBrowseProductIntent =
    hasExplicitBudget ||
    normQ.includes("tim do") ||
    normQ.includes("tim san pham") ||
    normQ.includes("tim trang phuc") ||
    normQ.includes("goi y") ||
    normQ.includes("cho minh xem") ||
    normQ.includes("co mau nao") ||
    normQ.includes("co do gi") ||
    normQ.includes("thue do di tiec") ||
    normQ.includes("thue do di du lich");

  if (hasExplicitBrowseProductIntent && !isProceduralQuestion) {
    let generalDocs = allRentDocs;
    if (requestedLocation) {
      const byLoc = generalDocs.filter((d) => d.location === requestedLocation);
      if (byLoc.length > 0) generalDocs = byLoc;
    }
    if (hasExplicitBudget) {
      const byBudget = generalDocs.filter((d) => Number(d.pricePerDay || 0) <= maxBudget);
      if (byBudget.length > 0) generalDocs = byBudget;
    }

    const mappedGeneral = generalDocs
      .slice(0, 4)
      .map((d) => mapRentDocToAIRec(d, days, maxBudget));

    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Gợi ý các mẫu trang phục & phụ kiện nổi bật cho bạn!",
      bannerSubtitle: `Đã tính toán chi phí theo chu kỳ ${days} ngày và ngân sách ${formatVND(maxBudget)}/ngày.`,
      text: `Dựa trên nhu cầu thuê ${days} ngày (ngân sách tới ${formatVND(maxBudget)}/ngày), đây là các mẫu trang phục và phụ kiện được yêu thích nhất trong kho:`,
      recommendations: mappedGeneral,
      quickFollowUps: [
        "Tìm đầm dạ hội đi tiệc sang trọng",
        "Cho mình xem các mẫu giày cao gót và sneaker",
        "Tìm bộ Suit nam hoặc Áo blazer",
      ],
    };
  }

  // 9. Mặc định cho các câu hỏi thông tin / thủ tục / trò chuyện khác (CHỈ TRẢ LỜI VĂN BẢN, KHÔNG GỬI KÈM SẢN PHẨM)
  if (normQ.includes("giay to") || normQ.includes("cccd") || normQ.includes("cmnd") || normQ.includes("thu tuc")) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Thủ tục thuê đồ trên ReUse Hub có cần giữ giấy tờ không?",
      bannerSubtitle: "Không giữ giấy tờ tùy thân · Bảo chứng hoàn toàn qua Smart Escrow.",
      text:
        "Khi thuê trang phục tại **ReUse Hub**, bạn **KHÔNG cần thế chấp CCCD hay giấy tờ tùy thân gốc**:\n\n" +
        "• Toàn bộ giao dịch được bảo chứng tự động thông qua khoản **Tiền đặt cọc Smart Escrow** ngay khi đặt đơn.\n" +
        "• Bạn chỉ cần có tài khoản đã đăng nhập, điền địa chỉ nhận hàng và thanh toán trực tuyến là đơn thuê được duyệt giao ngay!",
      recommendations: [],
      quickFollowUps: [
        "Cách thuê đồ như thế nào?",
        "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
      ],
    };
  }

  if (normQ.includes("thanh toan") || normQ.includes("chuyen khoan") || normQ.includes("vi") || normQ.includes("huy don")) {
    return {
      id: `ai-${Date.now()}`,
      sender: "ai",
      timestamp: nowTime,
      bannerTitle: "Chính sách Thanh toán & Hủy đơn trên ReUse Hub",
      bannerSubtitle: "An toàn, nhanh chóng và hoàn tiền 100% nếu hủy trước khi giao.",
      text:
        "Thông tin về thanh toán và hủy đơn tại **ReUse Hub**:\n\n" +
        "• **Phương thức thanh toán:** Bạn có thể thanh toán trực tiếp qua **Ví ReUse Hub**, cổng thanh toán trực tuyến hoặc chuyển khoản ngân hàng.\n" +
        "• **Chính sách hủy đơn:** Nếu đơn hàng chưa chuyển sang trạng thái *Đang giao hàng*, bạn có thể hủy đơn bất cứ lúc nào và nhận lại **100% tiền thuê + tiền cọc** về Ví ngay lập tức.",
      recommendations: [],
      quickFollowUps: [
        "Cách thuê đồ như thế nào?",
        "Nếu trả đồ sớm hơn lịch hẹn thì tính phí sao?",
      ],
    };
  }

  return {
    id: `ai-${Date.now()}`,
    sender: "ai",
    timestamp: nowTime,
    bannerTitle: "Trợ lý ảo ReUse AI sẵn sàng giải đáp cho bạn!",
    bannerSubtitle: "Hỏi quy trình thuê/mua hoặc nhập tên trang phục bạn muốn tìm.",
    text:
      "Mình có thể hỗ trợ bạn giải đáp mọi thắc mắc về:\n" +
      "• **Quy trình thuê đồ & trả đồ:** Cách đặt thuê 4 bước, chính sách giặt hấp miễn phí, đổi size trong 4h.\n" +
      "• **Cơ chế tiền cọc Smart Escrow & Biên bản CLA:** Bảo vệ 100% tiền cọc và hoàn tiền tự động về Ví.\n" +
      "• **Tìm kiếm trang phục theo yêu cầu:** Khi nào bạn muốn xem sản phẩm, chỉ cần nhắn tên món đồ (ví dụ: *\"Đầm dạ hội\"*, *\"Áo dài\"*, *\"Suit nam\"*, *\"Giày cao gót\"*...) mình sẽ gửi đúng sản phẩm đó cho bạn nhé!",
    recommendations: [],
    quickFollowUps: [
      "Cách thuê đồ như thế nào?",
      "Khi nào tôi được hoàn lại 100% tiền đặt cọc Smart Escrow?",
      "Biên bản đồng kiểm CLA 3 góc khi nhận hàng là gì?",
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
