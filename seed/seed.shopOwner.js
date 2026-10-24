import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/modules/user/user.model.js";
import Category from "../src/modules/category/category.model.js";
import Product from "../src/modules/rent/product/product.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../src/modules/rent/order/order.model.js";
import ThriftListing from "../src/modules/thrift/listing/thriftListing.model.js";
import ThriftOrder, { THRIFT_ORDER_STATUS } from "../src/modules/thrift/order/thriftOrder.model.js";

const seedShopOwnerDatabase = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB for Shop Owner data seed...");

    // 1. Tìm Shop Owner và Renter (User)
    const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwner) {
      throw new Error("Không tìm thấy SHOP_OWNER. Vui lòng chạy npm run seed:master trước.");
    }

    const renter = await User.findOne({ role: "USER" }) || shopOwner;

    // 2. Tìm danh mục và sản phẩm cho thuê
    const categories = await Category.find({});
    const cameraCat = categories.find((c) => c.slug === "camera") || categories[0];
    const fashionCat = categories.find((c) => c.slug === "fashion" || c.slug === "clothing") || categories[0];
    const shoesCat = categories.find((c) => c.slug === "shoes") || categories[0];

    const rentalProducts = await Product.find({ ownerId: shopOwner._id });
    if (rentalProducts.length === 0) {
      throw new Error("Chưa có sản phẩm RENT nào. Vui lòng chạy npm run seed:master trước.");
    }

    // 3. SEED THRIFT LISTINGS (Đồ thanh lý của Shop Owner)
    console.log("Seeding Thrift Listings for Shop Owner...");
    await ThriftListing.deleteMany({ ownerId: shopOwner._id });

    const sampleThriftListings = [
      {
        ownerId: shopOwner._id,
        name: "Hasselblad 907X 50C + Lens XCD 45mm F4 P",
        description: "Hệ thống medium format cao cấp, ngoại hình 98%, thấu kính nguyên bản không bụi mốc. Hàng chính hãng Atelier thanh lý sau chu kỳ lưu ký.",
        categoryId: cameraCat._id,
        price: 119000000,
        condition: "Rất tốt (98%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCVnSQ6kvsJ6DxJIvv2pi3AAWJYbGWlRw8oTuyWmVCDILWkQsLSfvD01kMlL9OXDn9YM1K6JYsZivR7ONBnoowg5ng5rnDV6Jr5Z8wD-KrpaLR4fpcu5NCf6i6HQwrd8WI3xqykuYx3ol5LZ9QO3agKknyMUT-2QZmrKNoCBRBjK8nq72d4HvE_ZagqStc9b8LcNnrAbk5HuLJpMBFOWJJhqF6a3k7eHnMQH2cqG3Zg",
        ],
        location: "Đà Nẵng",
        status: "APPROVED",
        sourceType: "RENTAL_PRODUCT",
        sourceRentalProductId: rentalProducts[0]?._id,
      },
      {
        ownerId: shopOwner._id,
        name: "Leica Summicron-M 35mm f/2 ASPH V2 Chrome",
        description: "Ống kính quang học di sản Leica dòng M, khẩu lớn f/2, độ tương phản tuyệt mỹ, kèm hood kim loại chính hãng.",
        categoryId: cameraCat._id,
        price: 68500000,
        condition: "Xuất sắc (99%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDm9RHp_nAFGyZAGYxDLuSj2aEJ1h1N-U9WI7PAFWW7ZyfVfl1i_9SppV5JiKn77I8cJ_bsDk1yKDbhK7ua6iE0__0FrQpGra28G6Yt_gWfXn44AauvwE85glJuv7mhovOe_fQm_64353WGhh-yXyasdXNywXSTsgjbqL6GWjRg7xe-alf5PYk6YJEQ4Ew9ZErc7V38NU-BCrvgK7m2VReo2j_s_PneV8IEQBWJ0hmx",
        ],
        location: "TP. Hồ Chí Minh",
        status: "APPROVED",
        sourceType: "MANUAL",
      },
      {
        ownerId: shopOwner._id,
        name: "Sony FE 50mm f/1.2 GM Master Lens",
        description: "Ống kính chân dung đỉnh cao cho hệ máy ngàm E, thấu kính XA siêu sắc nét, bokeh tròn mịn.",
        categoryId: cameraCat._id,
        price: 37500000,
        condition: "Tốt (95%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuD9te3aJVYpGneDteUKFIdq6xEbIuYlTZXQ6bppTxwXer5UXL315L_slY8JybSWI0sElJdsxst5JeOU8COAV8d_9Id7BShJa1ubVjLBUxiuArZt_Us8GrKWyoDdUBpTh8Vu7ZJjF_FE_lY1wpNp-QphW1iJOowGOrHjdZJ0AhC0rxCOupCG6SMWnR7Fsnn3F6GWjyzYTa1UdOhqfDBBUNRlYARbhpYkepNnwYwEO5jd",
        ],
        location: "Đà Nẵng",
        status: "APPROVED",
        sourceType: "RENTAL_PRODUCT",
        sourceRentalProductId: rentalProducts[1]?._id,
      },
      {
        ownerId: shopOwner._id,
        name: "Áo Khoác Denim Chế Tác Vintage Nhật Bản",
        description: "Áo denim dệt thủ công selvedge 14oz, wash tự nhiên có nét sờn cổ điển, phom unisex sang trọng.",
        categoryId: fashionCat._id,
        price: 2850000,
        condition: "Đẹp cổ điển (90%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuAtmXKLrFBh-ULvSwIfPH1-6Wt20ZZ6MVkUuMWLCglFjw1kWB6QFMzh2-V6BXtow5H6r3Mbt8RSgMy-DL2iSfu901WIFIU_yZfWuObWTRd4NoP9Nh1jctTIF7wGjHkgI4D5oxH6_dDBVra7zeHdkwYMXvpTTvPzpsf0XKcML75jinBrzziZBMszcYr5tYuRg6PC9_OCoBVNoPUb4MfpHrUPrGF2yzFQQLz7iIk6cPu5",
        ],
        location: "Hà Nội",
        status: "APPROVED",
        sourceType: "MANUAL",
      },
      {
        ownerId: shopOwner._id,
        name: "Classic Leather Derby Shoes Da Bê Pháp",
        description: "Giày da nam buộc dây thủ công đế Goodyear welted, da bê mềm mại, form dáng chuẩn phong cách quý ông.",
        categoryId: shoesCat._id,
        price: 3600000,
        condition: "Rất tốt (95%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCBGX9MLaXkDPpkpvRKdy2axzNTQbnNx_zdNdPhaZIyGar7jQumeRDAiXCgdqV-vo2remereT9vKy1u0lXTPcTjUwHWw2BUN5nVjtbW3A7Kck2D8oSAuMlA4YWikHGVx2wLPa4O73p6BniZAEsLW2gaF64ui2yqlzuI6QxQw-FAJ6EEbSwiKl9WQGZVRuhW0izycAPRBT0Wp20b8b6yIXFPDTRtD61j3kfI03X6CBtE",
        ],
        location: "Đà Nẵng",
        status: "APPROVED",
        sourceType: "MANUAL",
      },
      {
        ownerId: shopOwner._id,
        name: "Lều Cắm Trại Vintage Cotton Canvas 3P",
        description: "Lều vải canvas chống nước tự nhiên thoáng khí, thích hợp glamping và các chuyến dã ngoại cuối tuần.",
        categoryId: cameraCat._id,
        price: 4500000,
        condition: "Tốt (92%)",
        images: [
          "https://lh3.googleusercontent.com/aida-public/AB6AXuB1UpAkWSNWMQ1I3uDPXGKoJ-9POEmgeq7YpIuQ79QNfhv4wiFY--5DWEuQmRz157eN8zUtLw0-UevOSecwGvpA0ZrRN9VGHK-2-C5pFiUfYSHUx2MqqlZVsl629nHldrxwTBy5kgIb-ZIWJuDAl_Qky-i9C9MXMvUbdPsXpBqf_6hXLn00pNo_aYsD8vvfLcMsOpvOBXd4efa0KQnDAZ_YWGvL09INihtDBxqszHib",
        ],
        location: "TP. Hồ Chí Minh",
        status: "SOLD",
        sourceType: "RENTAL_PRODUCT",
        sourceRentalProductId: rentalProducts[3]?._id,
      },
    ];

    const seededThriftListings = await ThriftListing.insertMany(sampleThriftListings);
    console.log(`Đã seed ${seededThriftListings.length} ThriftListings vào MongoDB`);

    // 4. SEED RENTAL ORDERS (Đơn thuê cho Shop Owner quản lý)
    console.log("Seeding Rental Orders for Shop Owner...");
    await RentalOrder.deleteMany({ shopOwnerId: shopOwner._id });

    const now = new Date();
    const addDays = (d, n) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

    const sampleRentalOrders = [
      {
        orderCode: `RO-${Date.now()}-001`,
        renterId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            productId: rentalProducts[0]._id,
            productName: rentalProducts[0].name,
            pricePerDay: rentalProducts[0].pricePerDay,
            depositAmount: rentalProducts[0].depositAmount,
            quantity: 1,
            imageUrl: rentalProducts[0].images?.[0] || "",
          },
        ],
        startDate: addDays(now, 1),
        endDate: addDays(now, 4),
        rentalFee: rentalProducts[0].pricePerDay * 3,
        depositAmount: rentalProducts[0].depositAmount,
        shippingFee: 45000,
        totalAmount: rentalProducts[0].pricePerDay * 3 + rentalProducts[0].depositAmount + 45000,
        shippingAddress: {
          recipientName: "Lê Hoàng Yến",
          recipientPhone: "0905123456",
          province: "Đà Nẵng",
          district: "Hải Châu",
          ward: "Hải Châu 1",
          detail: "45 Trần Phú",
        },
        status: RENTAL_ORDER_STATUS.PENDING,
        paymentStatus: "PENDING",
      },
      {
        orderCode: `RO-${Date.now()}-002`,
        renterId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            productId: rentalProducts[1]._id,
            productName: rentalProducts[1].name,
            pricePerDay: rentalProducts[1].pricePerDay,
            depositAmount: rentalProducts[1].depositAmount,
            quantity: 1,
            imageUrl: rentalProducts[1].images?.[0] || "",
          },
        ],
        startDate: addDays(now, 2),
        endDate: addDays(now, 5),
        rentalFee: rentalProducts[1].pricePerDay * 3,
        depositAmount: rentalProducts[1].depositAmount,
        shippingFee: 40000,
        totalAmount: rentalProducts[1].pricePerDay * 3 + rentalProducts[1].depositAmount + 40000,
        shippingAddress: {
          recipientName: "Trần Anh Quân",
          recipientPhone: "0912345678",
          province: "Hà Nội",
          district: "Hoàn Kiếm",
          ward: "Tràng Tiền",
          detail: "12 Lý Thường Kiệt",
        },
        status: RENTAL_ORDER_STATUS.PAID,
        paymentStatus: "PAID",
      },
      {
        orderCode: `RO-${Date.now()}-003`,
        renterId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            productId: rentalProducts[2]._id,
            productName: rentalProducts[2].name,
            pricePerDay: rentalProducts[2].pricePerDay,
            depositAmount: rentalProducts[2].depositAmount,
            quantity: 1,
            imageUrl: rentalProducts[2].images?.[0] || "",
          },
        ],
        startDate: addDays(now, -1),
        endDate: addDays(now, 2),
        rentalFee: rentalProducts[2].pricePerDay * 3,
        depositAmount: rentalProducts[2].depositAmount,
        shippingFee: 35000,
        totalAmount: rentalProducts[2].pricePerDay * 3 + rentalProducts[2].depositAmount + 35000,
        shippingAddress: {
          recipientName: "Nguyễn Hải Đăng",
          recipientPhone: "0987654321",
          province: "Hồ Chí Minh",
          district: "Quận 1",
          ward: "Bến Nghé",
          detail: "88 Đồng Khởi",
        },
        shippingDetails: {
          carrier: "Viettel Post Chuyên Dụng Nanuk",
          trackingCode: "VTP-88492041-VN",
          shippedAt: new Date(),
        },
        status: RENTAL_ORDER_STATUS.SHIPPING,
        paymentStatus: "PAID",
      },
      {
        orderCode: `RO-${Date.now()}-004`,
        renterId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            productId: rentalProducts[3]._id,
            productName: rentalProducts[3].name,
            pricePerDay: rentalProducts[3].pricePerDay,
            depositAmount: rentalProducts[3].depositAmount,
            quantity: 1,
            imageUrl: rentalProducts[3].images?.[0] || "",
          },
        ],
        startDate: addDays(now, -3),
        endDate: addDays(now, 1),
        rentalFee: rentalProducts[3].pricePerDay * 4,
        depositAmount: rentalProducts[3].depositAmount,
        shippingFee: 50000,
        totalAmount: rentalProducts[3].pricePerDay * 4 + rentalProducts[3].depositAmount + 50000,
        shippingAddress: {
          recipientName: "Phạm Thùy Linh",
          recipientPhone: "0934567890",
          province: "Đà Nẵng",
          district: "Sơn Trà",
          ward: "An Hải Bắc",
          detail: "21 Phạm Văn Đồng",
        },
        status: RENTAL_ORDER_STATUS.RENTING,
        paymentStatus: "PAID",
      },
      {
        orderCode: `RO-${Date.now()}-005`,
        renterId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            productId: rentalProducts[4]._id,
            productName: rentalProducts[4].name,
            pricePerDay: rentalProducts[4].pricePerDay,
            depositAmount: rentalProducts[4].depositAmount,
            quantity: 1,
            imageUrl: rentalProducts[4].images?.[0] || "",
          },
        ],
        startDate: addDays(now, -6),
        endDate: addDays(now, -1),
        rentalFee: rentalProducts[4].pricePerDay * 5,
        depositAmount: rentalProducts[4].depositAmount,
        shippingFee: 45000,
        totalAmount: rentalProducts[4].pricePerDay * 5 + rentalProducts[4].depositAmount + 45000,
        shippingAddress: {
          recipientName: "Đặng Minh Tâm",
          recipientPhone: "0977889900",
          province: "Hồ Chí Minh",
          district: "Quận 3",
          ward: "Võ Thị Sáu",
          detail: "120 Tú Xương",
        },
        returnRequest: {
          images: [rentalProducts[4].images?.[0] || "https://placehold.co/600x400"],
          note: "Khách xin hoàn tất trả đồ, máy còn nguyên tem kiểm định.",
          requestedAt: new Date(),
        },
        status: RENTAL_ORDER_STATUS.RETURN_REQUESTED,
        paymentStatus: "PAID",
      },
    ];

    const seededRentalOrders = await RentalOrder.insertMany(sampleRentalOrders);
    console.log(`Đã seed ${seededRentalOrders.length} RentalOrders cho Shop Owner vào MongoDB`);

    // 5. SEED THRIFT ORDERS (Đơn mua đồ thanh lý của Shop)
    console.log("Seeding Thrift Orders for Shop Owner...");
    await ThriftOrder.deleteMany({ shopOwnerId: shopOwner._id });

    const sampleThriftOrders = [
      {
        orderCode: `TO-${Date.now()}-9101`,
        buyerId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            listingId: seededThriftListings[0]._id,
            productId: seededThriftListings[0]._id,
            name: seededThriftListings[0].name,
            price: seededThriftListings[0].price,
            quantity: 1,
            condition: seededThriftListings[0].condition,
            images: seededThriftListings[0].images,
            sellerId: shopOwner._id,
            ownerId: shopOwner._id,
          },
        ],
        itemsTotal: seededThriftListings[0].price,
        subtotal: seededThriftListings[0].price,
        shippingFee: 45000,
        totalAmount: seededThriftListings[0].price + 45000,
        shippingAddress: {
          recipientName: "Elena Rostova",
          recipientPhone: "0909112233",
          province: "Hồ Chí Minh",
          district: "Quận 1",
          ward: "Bến Nghé",
          detail: "15 Lê Thánh Tôn",
        },
        status: THRIFT_ORDER_STATUS.PAID,
        paymentStatus: "PAID",
        paymentMethod: "VNPAY",
        paidAt: addDays(now, -1),
      },
      {
        orderCode: `TO-${Date.now()}-9102`,
        buyerId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            listingId: seededThriftListings[1]._id,
            productId: seededThriftListings[1]._id,
            name: seededThriftListings[1].name,
            price: seededThriftListings[1].price,
            quantity: 1,
            condition: seededThriftListings[1].condition,
            images: seededThriftListings[1].images,
            sellerId: shopOwner._id,
            ownerId: shopOwner._id,
          },
        ],
        itemsTotal: seededThriftListings[1].price,
        subtotal: seededThriftListings[1].price,
        shippingFee: 35000,
        totalAmount: seededThriftListings[1].price + 35000,
        shippingAddress: {
          recipientName: "Hoàng Nhật Minh",
          recipientPhone: "0918889999",
          province: "Hà Nội",
          district: "Ba Đình",
          ward: "Điện Biên",
          detail: "32 Hùng Vương",
        },
        status: THRIFT_ORDER_STATUS.SHIPPING,
        paymentStatus: "PAID",
        paymentMethod: "VNPAY",
        paidAt: addDays(now, -2),
      },
      {
        orderCode: `TO-${Date.now()}-9103`,
        buyerId: renter._id,
        shopOwnerId: shopOwner._id,
        items: [
          {
            listingId: seededThriftListings[2]._id,
            productId: seededThriftListings[2]._id,
            name: seededThriftListings[2].name,
            price: seededThriftListings[2].price,
            quantity: 1,
            condition: seededThriftListings[2].condition,
            images: seededThriftListings[2].images,
            sellerId: shopOwner._id,
            ownerId: shopOwner._id,
          },
        ],
        itemsTotal: seededThriftListings[2].price,
        subtotal: seededThriftListings[2].price,
        shippingFee: 40000,
        totalAmount: seededThriftListings[2].price + 40000,
        shippingAddress: {
          recipientName: "Nguyễn Vũ Thảo My",
          recipientPhone: "0903334455",
          province: "Đà Nẵng",
          district: "Ngũ Hành Sơn",
          ward: "Khuê Mỹ",
          detail: "105 Võ Nguyên Giáp",
        },
        status: THRIFT_ORDER_STATUS.COMPLETED,
        paymentStatus: "PAID",
        paymentMethod: "VNPAY",
        paidAt: addDays(now, -5),
      },
    ];

    const seededThriftOrders = await ThriftOrder.insertMany(sampleThriftOrders);
    console.log(`Đã seed ${seededThriftOrders.length} ThriftOrders cho Shop Owner vào MongoDB`);

    console.log("✅ SHOP OWNER DATABASE SEED HOÀN TẤT THÀNH CÔNG 100%!");
  } catch (error) {
    console.error("Lỗi khi seed Shop Owner database:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seedShopOwnerDatabase();
