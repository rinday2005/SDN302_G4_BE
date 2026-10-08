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
        new: true,
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
      new: true,
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
      new: true,
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
      new: true,
      setDefaultsOnInsert: true,
    }
  );
  console.log("Sample User seeded (user@reuse.vn / Password123!)");
};

const seedProducts = async (categories) => {
  const fashionCat = categories.find((c) => c.slug === "quan-ao-thoi-trang") || categories[0];
  const partyCat = categories.find((c) => c.slug === "trang-phuc-da-hoi-su-kien") || categories[0];
  const accessoryCat = categories.find((c) => c.slug === "phu-kien") || categories[0];

  const sampleProducts = [
    {
      name: "Áo dài cách tân gấm hoa mai",
      slug: "ao-dai-cach-tan-gam-hoa-mai",
      description: "Áo dài truyền thống cách tân hiện đại, chất gấm mềm mịn thích hợp lễ tết, chụp ảnh.",
      category: fashionCat._id,
      type: "RENT",
      pricePerDay: 150000,
      deposit: 300000,
      stock: 5,
      sizes: ["S", "M", "L"],
      condition: "99%",
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Đầm dạ hội đính đá cao cấp",
      slug: "dam-da-hoi-dinh-da-cao-cap",
      description: "Đầm dạ hội đuôi cá quyến rũ, tôn dáng cho các buổi tiệc sang trọng.",
      category: partyCat._id,
      type: "RENT",
      pricePerDay: 250000,
      deposit: 500000,
      stock: 3,
      sizes: ["M", "L"],
      condition: "Mới 100%",
      images: [
        "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Bộ Vest nam công sở cao cấp",
      slug: "bo-vest-nam-cong-so-cao-cap",
      description: "Bộ vest lịch lãm phong cách Hàn Quốc, vừa có thể thuê theo ngày vừa có thể mua thanh lý.",
      category: fashionCat._id,
      type: "BOTH",
      pricePerDay: 200000,
      thriftPrice: 850000,
      deposit: 400000,
      stock: 4,
      sizes: ["L", "XL"],
      condition: "98%",
      images: [
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=600&q=80",
      ],
    },
    {
      name: "Túi xách da vintage thanh lý",
      slug: "tui-xach-da-vintage-thanh-ly",
      description: "Túi xách da phong cách cổ điển, phối đồ cực chất, bán thanh lý giá tốt.",
      category: accessoryCat._id,
      type: "THRIFT",
      thriftPrice: 320000,
      stock: 2,
      sizes: ["FreeSize"],
      condition: "95%",
      images: [
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=600&q=80",
      ],
    },
  ];

  for (const item of sampleProducts) {
    await Product.findOneAndUpdate(
      { slug: item.slug },
      item,
      {
        upsert: true,
        new: true,
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