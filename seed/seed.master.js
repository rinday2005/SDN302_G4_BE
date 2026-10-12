import mongoose from "mongoose";
import bcrypt from "bcrypt";

import connectDB from "../src/config/db.js";
import Category from "../src/modules/category/category.model.js";
import User from "../src/modules/user/user.model.js";
import Product from "../src/modules/rent/product/product.model.js";

const seedCategories = async () => {
  const categories = [
    {
      name: "Quần áo thời trang",
      slug: "quan-ao-thoi-trang",
      type: "BOTH",
      isActive: true,
    },
    {
      name: "Trang phục dạ hội & Sự kiện",
      slug: "trang-phuc-da-hoi-su-kien",
      type: "RENT",
      isActive: true,
    },
    {
      name: "Phụ kiện",
      slug: "phu-kien",
      type: "BOTH",
      isActive: true,
    },
  ];

  const results = [];
  for (const category of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: category.slug },
      category,
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );
    results.push(doc);
  }

  console.log("Category seed completed");
  return results;
};

const seedUsers = async () => {
  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 1. DUY NHẤT 1 SHOP OWNER
  const shopOwnerData = {
    email: "shopowner@reuse.vn",
    passwordHash,
    fullName: "ReUse Official Shop",
    phoneNumber: "0901234567",
    role: "SHOP_OWNER",
    kycStatus: "APPROVED",
    address: {
      province: "Hồ Chí Minh",
      district: "Quận 1",
      ward: "Bến Nghé",
      detail: "123 Lê Lợi, Phường Bến Nghé",
    },
  };

  await User.findOneAndUpdate(
    { role: "SHOP_OWNER" },
    shopOwnerData,
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
  console.log("Single Shop Owner seeded (shopowner@reuse.vn / Password123!)");

  // 2. TÀI KHOẢN ADMIN
  await User.findOneAndUpdate(
    { email: "admin@reuse.vn" },
    {
      email: "admin@reuse.vn",
      passwordHash,
      fullName: "System Admin",
      phoneNumber: "0909999999",
      role: "ADMIN",
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
  console.log("Admin seeded (admin@reuse.vn / Password123!)");

  // 3. TÀI KHOẢN USER KHÁCH HÀNG
  await User.findOneAndUpdate(
    { email: "user@reuse.vn" },
    {
      email: "user@reuse.vn",
      passwordHash,
      fullName: "Khách hàng mẫu",
      phoneNumber: "0988776655",
      role: "USER",
      address: {
        province: "Hồ Chí Minh",
        district: "Quận 3",
        ward: "Võ Thị Sáu",
        detail: "456 Nam Kỳ Khởi Nghĩa",
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
  console.log("Sample User seeded (user@reuse.vn / Password123!)");
};

const seedProducts = async (categories) => {
  const fashionCat = categories.find((c) => c.slug === "quan-ao-thoi-trang") || categories[0];
  const partyCat = categories.find((c) => c.slug === "trang-phuc-da-hoi-su-kien") || categories[0];
  const accessoryCat = categories.find((c) => c.slug === "phu-kien") || categories[0];

  const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
  if (!shopOwner) {
    throw new Error("Shop Owner must be seeded before seeding products");
  }

  const defaultLocation = shopOwner.address?.detail
    ? `${shopOwner.address.detail}, ${shopOwner.address.ward}, ${shopOwner.address.district}, ${shopOwner.address.province}`
    : "123 Lê Lợi, Phường Bến Nghé, Quận 1, Hồ Chí Minh";

  const sampleProducts = [
    {
      name: "Áo dài cách tân gấm hoa mai",
      description: "Áo dài truyền thống cách tân hiện đại, chất gấm mềm mịn thích hợp lễ tết, chụp ảnh.",
      categoryId: fashionCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 150000,
      depositAmount: 300000,
      totalQuantity: 5,
      condition: "LIKE_NEW",
      rentalRules: "Vui lòng giữ gìn cẩn thận, không làm rách hay dính vết bẩn khó tẩy.",
      location: defaultLocation,
      status: "APPROVED",
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Đầm dạ hội đính đá cao cấp",
      description: "Đầm dạ hội đuôi cá quyến rũ, tôn dáng cho các buổi tiệc sang trọng.",
      categoryId: partyCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 250000,
      depositAmount: 500000,
      totalQuantity: 3,
      condition: "NEW",
      rentalRules: "Không giặt nhiệt độ cao, trả nguyên trạng ban đầu.",
      location: defaultLocation,
      status: "APPROVED",
      images: [
        "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Bộ Vest nam công sở cao cấp",
      description: "Bộ vest lịch lãm phong cách Hàn Quốc, vừa có thể thuê theo ngày vừa có thể mua thanh lý.",
      categoryId: fashionCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 200000,
      depositAmount: 400000,
      totalQuantity: 4,
      condition: "LIKE_NEW",
      rentalRules: "Giữ form vest phẳng đẹp, không tự ý ủi nhiệt độ cao.",
      location: defaultLocation,
      status: "APPROVED",
      images: [
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Túi xách da vintage cổ điển",
      description: "Túi xách da phong cách cổ điển, phối đồ cực chất, thích hợp tiệc và chụp ảnh.",
      categoryId: accessoryCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 80000,
      depositAmount: 320000,
      totalQuantity: 2,
      condition: "GOOD",
      rentalRules: "Tránh tiếp xúc nước hoặc chất tẩy rửa mạnh.",
      location: defaultLocation,
      status: "APPROVED",
      images: [
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=600&q=80",
      ],
    },
  ];

  for (const item of sampleProducts) {
    await Product.findOneAndUpdate(
      { name: item.name },
      item,
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );
  }

  console.log("Sample products seeded for multi-item orders");
};

const runSeed = async () => {
  try {
    await connectDB();

    const categories = await seedCategories();
    await seedUsers();
    await seedProducts(categories);

    console.log("Master seed completed successfully");
  } catch (error) {
    console.error("Master seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

runSeed();