import mongoose from "mongoose";
import bcrypt from "bcrypt";

import connectDB from "../src/config/db.js";
import Category from "../src/modules/category/category.model.js";
import User from "../src/modules/user/user.model.js";
import Product from "../src/modules/rent/product/product.model.js";
import Cart from "../src/modules/cart/cart.model.js";

const seedCategories = async () => {
  const categories = [
    {
      name: "Camera",
      slug: "camera",
      type: "BOTH",
      isActive: true,
    },
    {
      name: "Giày dép",
      slug: "shoes",
      type: "BOTH",
      isActive: true,
    },
    {
      name: "Đầm dự tiệc",
      slug: "dam-du-tiec",
      type: "RENT",
      isActive: true,
    },
    {
      name: "Quần áo",
      slug: "clothing",
      type: "BOTH",
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

  // Đảm bảo tất cả user trong hệ thống đều có 1 cart tương ứng (1 user - 1 cart)
  const allUsers = await User.find({});
  for (const u of allUsers) {
    await Cart.findOneAndUpdate(
      { userId: u._id },
      { $setOnInsert: { userId: u._id, rentItems: [], thriftItems: [] } },
      { upsert: true }
    );
  }
  console.log(`Matched and initialized carts for all ${allUsers.length} users`);
};

const seedProducts = async (categories) => {
  const cameraCat = categories.find((c) => c.slug === "camera") || categories[0];
  const fashionCat = categories.find((c) => c.slug === "fashion") || categories[0];
  const shoesCat = categories.find((c) => c.slug === "shoes") || categories[0];
  const campingCat = categories.find((c) => c.slug === "camping") || categories[0];
  const electronicsCat = categories.find((c) => c.slug === "electronics") || categories[0];

  const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
  if (!shopOwner) {
    throw new Error("Shop Owner must be seeded before seeding products");
  }

  const sampleProducts = [
    {
      name: "Sony Alpha A7 IV Kit",
      description: "Máy ảnh mirrorless chuyên nghiệp Sony A7 IV kèm ống kính kit, cảm biến 33MP, quay 4K 60p sắc nét.",
      categoryId: cameraCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 450000,
      depositAmount: 2000000,
      totalQuantity: 5,
      condition: "GOOD",
      rentalRules: "Bảo quản máy cẩn thận, không làm trầy xước ống kính hay cảm biến.",
      location: "Đà Nẵng",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCVnSQ6kvsJ6DxJIvv2pi3AAWJYbGWlRw8oTuyWmVCDILWkQsLSfvD01kMlL9OXDn9YM1K6JYsZivR7ONBnoowg5ng5rnDV6Jr5Z8wD-KrpaLR4fpcu5NCf6i6HQwrd8WI3xqykuYx3ol5LZ9QO3agKknyMUT-2QZmrKNoCBRBjK8nq72d4HvE_ZagqStc9b8LcNnrAbk5HuLJpMBFOWJJhqF6a3k7eHnMQH2cqG3Zg",
      ],
    },
    {
      name: "Party Dress Thiết Kế Tối Giản",
      description: "Đầm dạ hội phong cách tối giản thanh lịch, chất vải lụa cao cấp, thích hợp dự tiệc và sự kiện.",
      categoryId: fashionCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 180000,
      depositAmount: 800000,
      totalQuantity: 4,
      condition: "LIKE_NEW",
      rentalRules: "Không giặt sấy nhiệt độ cao, giữ nguyên form dáng đầm.",
      location: "Đà Nẵng",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAtmXKLrFBh-ULvSwIfPH1-6Wt20ZZ6MVkUuMWLCglFjw1kWB6QFMzh2-V6BXtow5H6r3Mbt8RSgMy-DL2iSfu901WIFIU_yZfWuObWTRd4NoP9Nh1jctTIF7wGjHkgI4D5oxH6_dDBVra7zeHdkwYMXvpTTvPzpsf0XKcML75jinBrzziZBMszcYr5tYuRg6PC9_OCoBVNoPUb4MfpHrUPrGF2yzFQQLz7iIk6cPu5",
      ],
    },
    {
      name: "Classic Sneakers Da Thật Archive",
      description: "Giày sneaker da thật archive phong cách vintage cổ điển, êm chân và bền bỉ.",
      categoryId: shoesCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 150000,
      depositAmount: 600000,
      totalQuantity: 3,
      condition: "GOOD",
      rentalRules: "Tránh đi vào bùn lầy sâu, trả giày sạch sẽ.",
      location: "Đà Nẵng",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCBGX9MLaXkDPpkpvRKdy2axzNTQbnNx_zdNdPhaZIyGar7jQumeRDAiXCgdqV-vo2remereT9vKy1u0lXTPcTjUwHWw2BUN5nVjtbW3A7Kck2D8oSAuMlA4YWikHGVx2wLPa4O73p6BniZAEsLW2gaF64ui2yqlzuI6QxQw-FAJ6EEbSwiKl9WQGZVRuhW0izycAPRBT0Wp20b8b6yIXFPDTRtD61j3kfI03X6CBtE",
      ],
    },
    {
      name: "Snow Peak Alpha Breeze Camping Tent 4P",
      description: "Lều cắm trại 4 người Snow Peak Alpha Breeze chống mưa gió vượt trội, thoáng khí và dễ dựng.",
      categoryId: campingCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 250000,
      depositAmount: 1000000,
      totalQuantity: 3,
      condition: "GOOD",
      rentalRules: "Phơi khô ráo trước khi gấp gọn, không để tàn lửa tiếp xúc vải lều.",
      location: "Đà Nẵng",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuB1UpAkWSNWMQ1I3uDPXGKoJ-9POEmgeq7YpIuQ79QNfhv4wiFY--5DWEuQmRz157eN8zUtLw0-UevOSecwGvpA0ZrRN9VGHK-2-C5pFiUfYSHUx2MqqlZVsl629nHldrxwTBy5kgIb-ZIWJuDAl_Qky-i9C9MXMvUbdPsXpBqf_6hXLn00pNo_aYsD8vvfLcMsOpvOBXd4efa0KQnDAZ_YWGvL09INihtDBxqszHib",
      ],
    },
    {
      name: "Canon EOS R6 Mark II Mirrorless",
      description: "Thân máy ảnh Canon EOS R6 Mark II cảm biến 24.2MP, chống rung IBIS, lấy nét tự động mắt cực nhanh.",
      categoryId: cameraCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 500000,
      depositAmount: 2500000,
      totalQuantity: 4,
      condition: "LIKE_NEW",
      rentalRules: "Bảo quản máy trong túi chống sốc đi kèm, không tháo lắp ống kính dưới trời mưa bụi.",
      location: "TP. Hồ Chí Minh",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDm9RHp_nAFGyZAGYxDLuSj2aEJ1h1N-U9WI7PAFWW7ZyfVfl1i_9SppV5JiKn77I8cJ_bsDk1yKDbhK7ua6iE0__0FrQpGra28G6Yt_gWfXn44AauvwE85glJuv7mhovOe_fQm_64353WGhh-yXyasdXNywXSTsgjbqL6GWjRg7xe-alf5PYk6YJEQ4Ew9ZErc7V38NU-BCrvgK7m2VReo2j_s_PneV8IEQBWJ0hmx",
      ],
    },
    {
      name: "Áo Khoác Dạ Wool Dáng Dài Cao Cấp",
      description: "Áo khoác dạ lông cừu dáng dài thời thượng, giữ ấm hoàn hảo cho mùa đông và các chuyến du lịch Đà Lạt, Hà Nội.",
      categoryId: fashionCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 220000,
      depositAmount: 900000,
      totalQuantity: 3,
      condition: "LIKE_NEW",
      rentalRules: "Chỉ giặt khô, không dùng bàn ủi nóng trực tiếp lên bề mặt dạ.",
      location: "Hà Nội",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBmFHFDSIg4hOhOPqA36mT1kkDCl3WPEhUJRK08XZrwDTHzuiTwpPS19S9rp72RfWd75ovkeghRObBnjMEjwjM4C-han-LYxuwvvmbNoQxfmQdJ0b32KcCw-X0Jnqe_U23o9wu4QRqi1jvm0k2QIjvQX3uucHyHqIp2-wcXnh_PJzwTUThv7mBwqwtAjiXdUPGAdc-I8uwnLjfVeTg2aWPw2sXhSqhHAp-MSwbmguRZ",
      ],
    },
    {
      name: "Teenage Engineering OP-1 Field Synthesizer",
      description: "Thiết bị synthesizer / sampler di động đỉnh cao OP-1 Field, tích hợp 4-track tape recorder và pin 24 giờ.",
      categoryId: electronicsCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 320000,
      depositAmount: 1500000,
      totalQuantity: 2,
      condition: "GOOD",
      rentalRules: "Sử dụng nguồn sạc đúng chuẩn, giữ gìn phím bấm và núm xoay encoder.",
      location: "Đà Nẵng",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuD9te3aJVYpGneDteUKFIdq6xEbIuYlTZXQ6bppTxwXer5UXL315L_slY8JybSWI0sElJdsxst5JeOU8COAV8d_9Id7BShJa1ubVjLBUxiuArZt_Us8GrKWyoDdUBpTh8Vu7ZJjF_FE_lY1wpNp-QphW1iJOowGOrHjdZJ0AhC0rxCOupCG6SMWnR7Fsnn3F6GWjyzYTa1UdOhqfDBBUNRlYARbhpYkepNnwYwEO5jd",
      ],
    },
    {
      name: "Loa Di Động Bose S1 Pro+ System",
      description: "Hệ thống loa biểu diễn di động chuyên nghiệp Bose S1 Pro+, âm thanh mạnh mẽ, mixer 3 kênh, pin 11 giờ.",
      categoryId: electronicsCat._id,
      ownerId: shopOwner._id,
      pricePerDay: 280000,
      depositAmount: 1200000,
      totalQuantity: 3,
      condition: "GOOD",
      rentalRules: "Không sử dụng trong môi trường mưa ướt, tránh va đập mạnh.",
      location: "TP. Hồ Chí Minh",
      status: "APPROVED",
      images: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDAMWq7Usi-8ij0sf0N2-H4NCl1ScKH5274kxXc8AYWyPFy16zT_Kmq3tNSf8LN7ozbRrV99cjXr3HGqO3GJ6PI3P7C3MRDNDCyXlrDzFp3bl8Vy8MCY_G5ZyYkN8df8vo1U6wxOmaDZyNehhN4Oh56uVjgr3kV6uo7bpxr_YUl2Mvvextk0D-dRSVdxpZ5pQYNkX9Qt4yECCk-T8LqKmHDOzynNhWqS_X5lmFv5_qy",
      ],
    },
  ];

  const oldProductNames = [
    "Áo dài cách tân gấm hoa mai",
    "Đầm dạ hội đính đá cao cấp",
    "Bộ Vest nam công sở cao cấp",
    "Túi xách da vintage cổ điển",
    "Túi xách da vintage thanh lý",
  ];

  // 1. Dọn dẹp các sản phẩm mẫu cũ và test items không còn dùng
  await Product.deleteMany({
    $or: [{ name: { $in: oldProductNames } }, { name: /Sản phẩm test thuê/ }],
  });

  const productsCollection = mongoose.connection.db.collection("products");
  await productsCollection.deleteMany({
    $or: [
      { name: { $in: oldProductNames } },
      { name: /Sản phẩm test thuê/ },
      {
        slug: {
          $in: [
            "ao-dai-cach-tan-gam-hoa-mai",
            "dam-da-hoi-dinh-da-cao-cap",
            "bo-vest-nam-cong-so-cao-cap",
            "tui-xach-da-vintage-thanh-ly",
          ],
        },
      },
    ],
  });

  const slugify = (text) =>
    text
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

  // 2. Dọn dẹp collection products legacy nếu có
  try {
    await mongoose.connection.db.collection("products").drop();
  } catch {
    // ignore
  }

  // 3. Seed vào rentalProducts (AC Model)
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

  console.log("8 Marketplace products seeded into MongoDB rentalProducts collection");
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