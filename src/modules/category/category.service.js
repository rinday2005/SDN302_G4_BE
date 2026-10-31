import mongoose from "mongoose";
import Category from "./category.model.js";
import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";

const DEFAULT_CATEGORY_METADATA = {
  camera: {
    code: "CAT.01",
    description:
      "Máy ảnh và thiết bị quang học cao cấp cho những chuyến đi và khoảnh khắc đáng nhớ. Đầy đủ dòng máy film vintage lẫn mirrorless hiện đại.",
    subtitle: "Bao gồm body, lens prime & gimbal",
    image: "/images/cameracategory.jpg",
    icon: "photo_camera",
    inspectionBadge: "100% Kiểm định Shutter & Cảm biến",
    escrowBadge: "Escrow Bảo hiểm vi sai giá trị thực",
  },
  shoes: {
    code: "CAT.02",
    description:
      "Giày sneaker và những đôi giày da cao cấp, giày cao gót dự tiệc đã sẵn sàng cho vòng đời tiếp theo. Đã vệ sinh và khử trùng theo tiêu chuẩn chuyên sâu.",
    subtitle: "Khử khuẩn UV 100% · Archive Designer",
    image: "/images/shoescategory.jpg",
    icon: "steps",
    inspectionBadge: "100% Khử khuẩn UV-C & Phục hồi form",
    escrowBadge: "Smart Escrow Bảo chứng cọc an toàn",
  },
  "dam-du-tiec": {
    code: "CAT.03",
    description:
      "Đầm dạ hội, đầm dự tiệc thiết kế sang trọng cho dạ tiệc, sự kiện cưới hỏi. Giặt hấp công nghệ Ozone vô trùng bảo vệ từng sợi vải cao cấp.",
    subtitle: "Silk Satin · Haute Couture · Giặt hấp Ozone",
    image: "/images/dresscategory.jpg",
    icon: "styler",
    inspectionBadge: "100% Giặt hấp Ozone & Kiểm định đường may",
    escrowBadge: "Smart Escrow Giữ cọc an tâm 100%",
  },
  clothing: {
    code: "CAT.04",
    description:
      "Trang phục, áo khoác dạ wool dáng dài, vintage leather jacket được chọn lọc từ các thương hiệu thiết kế cao cấp và phong cách minimalism.",
    subtitle: "Wool · Leather · Archive Designer",
    image: "/images/clothescategory.jpg",
    icon: "checkroom",
    inspectionBadge: "100% Giặt khô hấp vô trùng cao cấp",
    escrowBadge: "Smart Escrow Bảo chứng cọc",
  },
  "phu-kien": {
    code: "CAT.05",
    description:
      "Dây chuyền ngọc trai, bông tai bạc Ý đính đá, quạt lụa cầm tay thủ công và trang sức phụ kiện cao cấp cho dạ tiệc và đời sống.",
    subtitle: "Dây chuyền · Bông tai · Quạt lụa · Trang sức",
    image: "/images/accessorycategory.jpg",
    icon: "diamond",
    inspectionBadge: "100% Kiểm định đá quý & Vệ sinh vô trùng",
    escrowBadge: "Smart Escrow Bảo hiểm cọc 100%",
  },
};

const enrichCategoriesWithStats = async (categories) => {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  let rentCountsMap = new Map();
  let thriftCountsMap = new Map();

  try {
    const [rentAgg, thriftAgg] = await Promise.all([
      RentalProduct.aggregate([
        { $match: { status: { $ne: "REJECTED" } } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]),
      ThriftListing.aggregate([
        { $match: { status: { $ne: "REJECTED" } } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]),
    ]);

    for (const r of rentAgg) {
      if (r._id) rentCountsMap.set(String(r._id), r.count);
    }
    for (const t of thriftAgg) {
      if (t._id) thriftCountsMap.set(String(t._id), t.count);
    }
  } catch {
    // Ignore aggregation errors if collections are empty
  }

  return categories.map((catDoc, idx) => {
    const obj = typeof catDoc.toObject === "function" ? catDoc.toObject() : { ...catDoc };
    const slug = (obj.slug || "").toLowerCase();
    const defaults = DEFAULT_CATEGORY_METADATA[slug] || {};

    const idStr = String(obj._id || obj.id || "");
    const rentItems = rentCountsMap.get(idStr) ?? 0;
    const thriftItems = thriftCountsMap.get(idStr) ?? 0;
    const totalItems = rentItems + thriftItems;

    const code =
      obj.code && obj.code.trim()
        ? obj.code.trim()
        : defaults.code || `CAT.${String(idx + 1).padStart(2, "0")}`;

    const description =
      obj.description && obj.description.trim()
        ? obj.description.trim()
        : defaults.description || `Danh mục sản phẩm ${obj.name} tuần hoàn được kiểm định chất lượng tại ReUse Hub.`;

    const subtitle =
      obj.subtitle && obj.subtitle.trim()
        ? obj.subtitle.trim()
        : defaults.subtitle || "Kiểm định chuẩn hóa 100% · Bảo chứng Smart Escrow";

    const image =
      obj.image && obj.image.trim()
        ? obj.image.trim()
        : defaults.image || "/images/cameracategory.jpg";

    const icon =
      obj.icon && obj.icon.trim()
        ? obj.icon.trim()
        : defaults.icon || "category";

    const inspectionBadge =
      obj.inspectionBadge && obj.inspectionBadge.trim()
        ? obj.inspectionBadge.trim()
        : defaults.inspectionBadge || "100% Kiểm định chất lượng & Khử trùng UV-C";

    const escrowBadge =
      obj.escrowBadge && obj.escrowBadge.trim()
        ? obj.escrowBadge.trim()
        : defaults.escrowBadge || "Smart Escrow Bảo chứng cọc an toàn 100%";

    const type = obj.type || "BOTH";
    const market = type === "BOTH" ? "COMMON" : type;
    const isActive = obj.isActive !== false;

    return {
      ...obj,
      id: idStr,
      name: obj.name,
      title: obj.name,
      slug: obj.slug,
      code,
      type,
      market,
      description,
      subtitle,
      image,
      icon,
      inspectionBadge,
      escrowBadge,
      isActive,
      status: isActive ? "ACTIVE" : "INACTIVE",
      rentItems,
      thriftItems,
      rentCount: rentItems,
      thriftCount: thriftItems,
      totalItems,
    };
  });
};

const getPublicCategories = async () => {
  const docs = await Category.find({
    isActive: true,
  }).sort({
    createdAt: 1,
    name: 1,
  });

  return enrichCategoriesWithStats(docs);
};

const getPublicCategoryBySlugOrId = async (slugOrId) => {
  const clean = String(slugOrId || "").trim().toLowerCase();
  let category = null;

  if (mongoose.Types.ObjectId.isValid(clean)) {
    category = await Category.findById(clean);
  }
  if (!category) {
    category = await Category.findOne({ slug: clean });
  }

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    error.errorCode = "CATEGORY_NOT_FOUND";
    throw error;
  }

  const [enriched] = await enrichCategoriesWithStats([category]);
  return enriched;
};

const getAllCategories = async () => {
  const docs = await Category.find().sort({
    createdAt: -1,
  });

  return enrichCategoriesWithStats(docs);
};

const getCategoryById = async (categoryId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    const error = new Error("Invalid category id");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_ID";
    throw error;
  }

  const category = await Category.findById(categoryId);

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    error.errorCode = "CATEGORY_NOT_FOUND";
    throw error;
  }

  return category;
};

const createCategory = async (categoryData) => {
  const name = categoryData.name.trim();
  const slug = categoryData.slug
    .replace(/^\/categories\//i, "")
    .replace(/^\/+/, "")
    .trim()
    .toLowerCase();

  const existingCategory = await Category.findOne({
    $or: [
      { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
      { slug },
    ],
  });

  if (existingCategory) {
    const error = new Error("Category name or slug already exists");
    error.statusCode = 409;
    error.errorCode = "CATEGORY_ALREADY_EXISTS";
    throw error;
  }

  let code = categoryData.code ? String(categoryData.code).trim() : "";
  if (!code) {
    const count = await Category.countDocuments();
    code = `CAT.${String(count + 1).padStart(2, "0")}`;
  }

  const rawType = categoryData.type === "COMMON" ? "BOTH" : categoryData.type;
  const defaults = DEFAULT_CATEGORY_METADATA[slug] || {};

  const created = await Category.create({
    name,
    slug,
    code,
    type: rawType || "BOTH",
    description:
      categoryData.description !== undefined && String(categoryData.description).trim()
        ? String(categoryData.description).trim()
        : defaults.description || `Danh mục sản phẩm ${name} tuần hoàn được kiểm định chất lượng tại ReUse Hub.`,
    subtitle:
      categoryData.subtitle !== undefined && String(categoryData.subtitle).trim()
        ? String(categoryData.subtitle).trim()
        : defaults.subtitle || "Kiểm định chuẩn hóa 100% · Bảo chứng Smart Escrow",
    image:
      categoryData.image !== undefined && String(categoryData.image).trim()
        ? String(categoryData.image).trim()
        : defaults.image || "",
    icon:
      categoryData.icon !== undefined && String(categoryData.icon).trim()
        ? String(categoryData.icon).trim()
        : defaults.icon || "category",
    inspectionBadge:
      categoryData.inspectionBadge !== undefined && String(categoryData.inspectionBadge).trim()
        ? String(categoryData.inspectionBadge).trim()
        : defaults.inspectionBadge || "100% Kiểm định chất lượng & Khử trùng UV-C",
    escrowBadge:
      categoryData.escrowBadge !== undefined && String(categoryData.escrowBadge).trim()
        ? String(categoryData.escrowBadge).trim()
        : defaults.escrowBadge || "Smart Escrow Bảo chứng cọc an toàn 100%",
    isActive:
      categoryData.isActive !== undefined
        ? categoryData.isActive
        : true,
  });

  const [enriched] = await enrichCategoriesWithStats([created]);
  return enriched;
};

const updateCategory = async (categoryId, categoryData) => {
  const category = await getCategoryById(categoryId);

  if (categoryData.name !== undefined) {
    const name = categoryData.name.trim();

    const duplicatedName = await Category.findOne({
      _id: { $ne: category._id },
      name: {
        $regex: `^${escapeRegex(name)}$`,
        $options: "i",
      },
    });

    if (duplicatedName) {
      const error = new Error("Category name already exists");
      error.statusCode = 409;
      error.errorCode = "CATEGORY_NAME_ALREADY_EXISTS";
      throw error;
    }

    category.name = name;
  }

  if (categoryData.slug !== undefined) {
    const slug = categoryData.slug
      .replace(/^\/categories\//i, "")
      .replace(/^\/+/, "")
      .trim()
      .toLowerCase();

    const duplicatedSlug = await Category.findOne({
      _id: { $ne: category._id },
      slug,
    });

    if (duplicatedSlug) {
      const error = new Error("Category slug already exists");
      error.statusCode = 409;
      error.errorCode = "CATEGORY_SLUG_ALREADY_EXISTS";
      throw error;
    }

    category.slug = slug;
  }

  if (categoryData.type !== undefined) {
    category.type = categoryData.type === "COMMON" ? "BOTH" : categoryData.type;
  }

  if (categoryData.code !== undefined) {
    category.code = String(categoryData.code).trim();
  }

  if (categoryData.description !== undefined) {
    category.description = String(categoryData.description).trim();
  }

  if (categoryData.subtitle !== undefined) {
    category.subtitle = String(categoryData.subtitle).trim();
  }

  if (categoryData.image !== undefined) {
    category.image = String(categoryData.image).trim();
  }

  if (categoryData.icon !== undefined) {
    category.icon = String(categoryData.icon).trim() || "category";
  }

  if (categoryData.inspectionBadge !== undefined) {
    category.inspectionBadge = String(categoryData.inspectionBadge).trim();
  }

  if (categoryData.escrowBadge !== undefined) {
    category.escrowBadge = String(categoryData.escrowBadge).trim();
  }

  if (categoryData.isActive !== undefined) {
    category.isActive = categoryData.isActive;
  }

  await category.save();

  const [enriched] = await enrichCategoriesWithStats([category]);
  return enriched;
};

const updateCategoryStatus = async (categoryId, isActive) => {
  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be boolean");
    error.statusCode = 400;
    error.errorCode = "INVALID_IS_ACTIVE";
    throw error;
  }

  const category = await getCategoryById(categoryId);

  category.isActive = isActive;

  await category.save();

  const [enriched] = await enrichCategoriesWithStats([category]);
  return enriched;
};

const deleteCategory = async (categoryId) => {
  const category = await getCategoryById(categoryId);

  await category.deleteOne();

  return category;
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export {
  getPublicCategories,
  getPublicCategoryBySlugOrId,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
};
