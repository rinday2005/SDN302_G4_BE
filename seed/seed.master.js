import mongoose from "mongoose";
import bcrypt from "bcrypt";

import connectDB, { syncUserCartsAndWishlists } from "../src/config/db.js";
import Category from "../src/modules/category/category.model.js";
import User from "../src/modules/user/user.model.js";
import Product from "../src/modules/rent/product/product.model.js";
import ThriftListing from "../src/modules/thrift/listing/thriftListing.model.js";
import Cart from "../src/modules/cart/cart.model.js";
import Wishlist from "../src/modules/wishlist/wishlist.model.js";
import KycRecord, { KYC_STATUS } from "../src/modules/kyc/kyc.model.js";

const seedCategories = async () => {
  // Xóa các danh mục không liên quan tới quần áo / thời trang khỏi MongoDB
  const nonFashionCats = await Category.find({
    $or: [
      { slug: { $in: ["camera", "camping", "electronics", "may-anh", "do-cam-trai", "thiet-bi-dien-tu"] } },
      { name: /camera|máy ảnh|cắm trại|điện tử|loa|lều|ống kính/i },
    ],
  }).select("_id").lean();

  if (nonFashionCats.length > 0) {
    const removedIds = nonFashionCats.map((c) => c._id);
    await Category.deleteMany({ _id: { $in: removedIds } });
    console.log(`Removed ${removedIds.length} non-clothing categories from MongoDB`);
  }

  const categories = [
    {
      name: "Quần áo",
      slug: "clothing",
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
      name: "Giày dép",
      slug: "shoes",
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

  console.log("Category seed completed (Quần áo, Đầm dự tiệc, Giày dép, Phụ kiện)");
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

  // Đảm bảo tất cả user trong hệ thống đều có đúng 1 cart và 1 wishlist tương ứng (1 user - 1 cart - 1 wishlist)
  await syncUserCartsAndWishlists();
};


const seedKyc = async () => {
  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // User nộp hồ sơ KYC: hon@gmail.com
  const honUser = await User.findOneAndUpdate(
    { email: "hon@gmail.com" },
    {
      email: "hon@gmail.com",
      passwordHash,
      fullName: "Nguyễn Hơn",
      phoneNumber: "0987364578",
      role: "USER",
      kycStatus: "PENDING",
      avatarUrl: "https://res.cloudinary.com/qs6kyqau/image/upload/v1792854543/reuse_hub/avatars/zsk3hx9obqvp0b5opilb.png",
      address: {
        province: "Thành phố Đà Nẵng",
        district: "Quận Hải Châu",
        ward: "Phường Hải Châu 1",
        detail: "48 Bạch Đằng",
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  await KycRecord.findOneAndUpdate(
    { userId: honUser._id },
    {
      userId: honUser._id,
      idCardNumber: "09873645782635",
      frontImageUrl: "https://res.cloudinary.com/qs6kyqau/image/upload/v1792864768/reuse_hub/kyc/lneerajhziqixnsom0h2.jpg",
      backImageUrl: "https://res.cloudinary.com/qs6kyqau/image/upload/v1792864769/reuse_hub/kyc/ollsyldqpnitwoxy2fxz.jpg",
      dob: "24/09/2005",
      fullName: "Nguyễn Hơn",
      residentAddress: "48 Bạch Đằng, Phường Hải Châu 1, Quận Hải Châu, Thành phố Đà Nẵng",
      status: KYC_STATUS.PENDING,
      rejectionReason: null,
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  console.log("Sample pending KYC record for hon@gmail.com seeded successfully");
};

const seedProducts = async (categories) => {
  const clothingCat = categories.find((c) => c.slug === "clothing") || categories[0];
  const partyDressCat = categories.find((c) => c.slug === "dam-du-tiec") || clothingCat;
  const shoesCat = categories.find((c) => c.slug === "shoes") || clothingCat;

  const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
  if (!shopOwner) {
    throw new Error("Shop Owner must be seeded before seeding products");
  }

  const sampleProducts = [
    {
      name: "Party Dress Thiết Kế Tối Giản",
      description: "Đầm dạ hội phong cách tối giản thanh lịch, chất vải lụa cao cấp, thích hợp dự tiệc và sự kiện.",
      categoryId: partyDressCat._id,
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
      name: "Áo Khoác Dạ Wool Dáng Dài Cao Cấp",
      description: "Áo khoác dạ lông cừu dáng dài thời thượng, giữ ấm hoàn hảo cho mùa đông và các chuyến du lịch Đà Lạt, Hà Nội.",
      categoryId: clothingCat._id,
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
  ];

  const nonClothingProductNames = [
    "Sony Alpha A7 IV Kit",
    "Snow Peak Alpha Breeze Camping Tent 4P",
    "Canon EOS R6 Mark II Mirrorless",
    "Teenage Engineering OP-1 Field Synthesizer",
    "Loa Di Động Bose S1 Pro+ System",
    "Túi xách da vintage cổ điển",
    "Túi xách da vintage thanh lý",
  ];

  const nonClothingRegex = /sony|canon|camera|máy ảnh|ống kính|hasselblad|leica|fujifilm|nikon|snow peak|lều cắm trại|camping tent|synthesizer|op-1|loa di động|bose s1|gimbal|dji|gopro|macbook|ipad|sản phẩm test thuê/i;

  // 1. Xóa sạch các sản phẩm không liên quan tới quần áo / thời trang khỏi rentalProducts & thriftListings
  const deletedRent = await Product.deleteMany({
    $or: [
      { name: { $in: nonClothingProductNames } },
      { name: nonClothingRegex },
      { description: /máy ảnh|ống kính|lều cắm trại|synthesizer|loa biểu diễn/i },
    ],
  });
  console.log(`Deleted ${deletedRent.deletedCount} non-clothing rental products from MongoDB`);

  const deletedThrift = await ThriftListing.deleteMany({
    $or: [
      { name: { $in: nonClothingProductNames } },
      { name: nonClothingRegex },
      { description: /máy ảnh|ống kính|lều cắm trại|synthesizer|loa biểu diễn/i },
    ],
  });
  if (deletedThrift.deletedCount > 0) {
    console.log(`Deleted ${deletedThrift.deletedCount} non-clothing thrift listings from MongoDB`);
  }

  // 2. Dọn dẹp collection products legacy nếu có
  try {
    await mongoose.connection.db.collection("products").drop();
  } catch {
    // ignore
  }

  // 3. Seed các sản phẩm thời trang/quần áo/giày dép vào rentalProducts
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

  // 4. Đảm bảo tất cả sản phẩm còn lại trong rentalProducts & thriftListings đều gắn đúng categoryId thời trang hợp lệ
  const validCatIds = categories.map((c) => String(c._id));
  const remainingRentProducts = await Product.find({}).lean();
  for (const rp of remainingRentProducts) {
    if (!validCatIds.includes(String(rp.categoryId))) {
      const n = (rp.name || "").toLowerCase();
      const targetCatId =
        n.includes("đầm") || n.includes("dress") || n.includes("váy")
          ? partyDressCat._id
          : n.includes("giày") || n.includes("sneaker") || n.includes("boot")
          ? shoesCat._id
          : clothingCat._id;
      await Product.updateOne({ _id: rp._id }, { $set: { categoryId: targetCatId } });
    }
  }

  console.log(
    `Remaining rentalProducts in MongoDB (${remainingRentProducts.length}):`,
    remainingRentProducts.map((p) => p.name)
  );
};

const seedThriftListings = async (categories) => {
  const shopOwner = await User.findOne({ email: "shopowner@reuse.vn" });
  if (!shopOwner) return;

  const clothingCat = categories.find((c) => c.slug === "clothing") || categories[0];
  const partyDressCat = categories.find((c) => c.slug === "dam-du-tiec") || clothingCat;
  const shoesCat = categories.find((c) => c.slug === "shoes") || categories[0];

  const sampleThrift = [
    {
      name: "Đầm Dạ Hội Nữ Maxi Sequins Xẻ Tà Sang Trọng",
      description: "Đầm dạ hội nữ dáng dài xẻ tà quyến rũ, đính đá và kim sa ánh bạc thủ công tinh xảo. Form dáng ôm tôn đường cong hoàn hảo, chất liệu tơ tằm sang trọng được thanh lý sau mùa diễn.",
      categoryId: partyDressCat._id,
      ownerId: shopOwner._id,
      price: 1850000,
      condition: "Như mới (99%)",
      status: "APPROVED",
      sourceType: "FROM_RENTAL",
      location: "Hà Nội",
      quantity: 2,
      images: [
        "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Đầm Dạ Hội Lụa Satin Xẻ Tà Phối Ren Cao Cấp",
      description: "Đầm dạ hội lụa satin xẻ tà sang trọng màu đen tuyền phối ren Haute Couture Pháp. Phom dáng ôm tôn dáng hoàn mỹ, giữ gìn cẩn thận sau 1 lần diện thảm đỏ.",
      categoryId: partyDressCat._id,
      ownerId: shopOwner._id,
      price: 1250000,
      condition: "Như mới (99%)",
      status: "APPROVED",
      sourceType: "MANUAL",
      location: "Hà Nội",
      quantity: 2,
      images: [
        "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Áo Dài Nữ Cách Tân Lụa Gấm Thêu Hoa Sen",
      description: "Áo dài cách tân nữ 4 tà dệt hoa sen chìm sắc nét, cổ trụ 3 phân thanh thoát, tà áo thướt tha, giữ gìn cẩn thận form dáng hoàn mỹ.",
      categoryId: clothingCat._id,
      ownerId: shopOwner._id,
      price: 950000,
      condition: "Rất tốt (98%)",
      status: "APPROVED",
      sourceType: "MANUAL",
      location: "Hà Nội",
      quantity: 3,
      images: [
        "https://images.unsplash.com/photo-1617059063772-34532796cdb5?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Áo Khoác Trench Coat Dạ Dáng Dài Khuy Đôi Vintage",
      description: "Áo khoác dáng dài chất liệu dạ ép hai mặt cao cấp phong cách Paris cổ điển, giữ ấm tốt, cầu vai tự nhiên đứng form tôn dáng.",
      categoryId: clothingCat._id,
      ownerId: shopOwner._id,
      price: 1100000,
      condition: "Rất tốt (97%)",
      status: "APPROVED",
      sourceType: "MANUAL",
      location: "Đà Nẵng",
      quantity: 1,
      images: [
        "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Áo Blazer Nữ Oversize Họa Tiết Caro Phong Cách Seoul",
      description: "Blazer dáng suông nữ tính trẻ trung năng động, cầu vai tự nhiên đứng form, chất vải dệt cao cấp, sản phẩm đang chờ Hội đồng thẩm định duyệt bài.",
      categoryId: clothingCat._id,
      ownerId: shopOwner._id,
      price: 680000,
      condition: "Tốt (95%)",
      status: "PENDING",
      sourceType: "MANUAL",
      location: "Hà Nội",
      quantity: 2,
      images: [
        "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Chân Váy Xếp Ly Dáng Dài Lụa Tơ Tằm Dập Ly Nhỏ",
      description: "Chân váy xếp ly dáng dài dập ly thủ công tỉ mỉ bằng lụa tơ tằm mềm mại thướt tha, cạp thun co giãn nhẹ nhàng thanh lịch dễ phối đồ.",
      categoryId: clothingCat._id,
      ownerId: shopOwner._id,
      price: 520000,
      condition: "Đã qua sử dụng (92%)",
      status: "SOLD",
      sourceType: "MANUAL",
      location: "Đà Nẵng",
      quantity: 0,
      images: [
        "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800&auto=format&fit=crop&q=80",
      ],
    },
    {
      name: "Bản Nháp: Set Váy Tweed Dạ Nữ Tiểu Thư Kèm Áo Croptop",
      description: "Hồ sơ bản nháp set dạ tweed nữ tiểu thư đang hoàn thiện hình ảnh chi tiết và bảng đo size 3 vòng trước khi gửi kiểm định.",
      categoryId: partyDressCat._id,
      ownerId: shopOwner._id,
      price: 890000,
      condition: "Như mới (99%)",
      status: "DRAFT",
      sourceType: "MANUAL",
      location: "Hà Nội",
      quantity: 1,
      images: [
        "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80",
      ],
    },
  ];

  for (const item of sampleThrift) {
    await ThriftListing.findOneAndUpdate(
      { name: item.name },
      item,
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );
  }

  console.log(`${sampleThrift.length} Quần áo / Thời trang Thrift listings seeded into MongoDB thriftListings collection`);
};

const runSeed = async () => {
  try {
    await connectDB();

    const categories = await seedCategories();
    await seedUsers();
    await seedKyc();
    await syncUserCartsAndWishlists();
    await seedProducts(categories);
    await seedThriftListings(categories);

    console.log("Master seed completed successfully");
  } catch (error) {
    console.error("Master seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

runSeed();