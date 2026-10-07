import mongoose from "mongoose";

import connectDB from "../src/config/db.js";
import Category from "../src/modules/category/category.model.js";

const seedCategories = async () => {
  const categories = [
    {
      name: "Quần áo thời trang",
      slug: "quan-ao-thoi-trang",
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

  for (const category of categories) {
    await Category.findOneAndUpdate(
      { slug: category.slug },
      category,
      {
  upsert: true,
  new: true,
  setDefaultsOnInsert: true,
}
    );
  }

  console.log("Category seed completed");
};

const runSeed = async () => {
  try {
    await connectDB();

    await seedCategories();

    console.log("Master seed completed successfully");
  } catch (error) {
    console.error("Master seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

runSeed();