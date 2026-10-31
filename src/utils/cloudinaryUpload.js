import cloudinary from "../config/cloudinary.js";

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} folder - Target folder in Cloudinary
 * @returns {Promise<object>} - Cloudinary upload result
 */
export const uploadImageToCloudinary = (buffer, folder = "reuse_hub/avatars") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
};

/**
 * Extract public_id from Cloudinary image URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} - Extracted public_id
 */
export const extractPublicIdFromUrl = (url) => {
  if (!url || typeof url !== "string" || !url.includes("cloudinary.com")) {
    return null;
  }
  try {
    const cleanUrl = url.split("?")[0];
    const match = cleanUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

/**
 * Delete an image from Cloudinary by public_id or URL
 * @param {string} publicIdOrUrl - Cloudinary public_id or image URL
 * @returns {Promise<object|null>} - Deletion result
 */
export const deleteImageFromCloudinary = async (publicIdOrUrl) => {
  if (!publicIdOrUrl) return null;
  const publicId = publicIdOrUrl.includes("http")
    ? extractPublicIdFromUrl(publicIdOrUrl)
    : publicIdOrUrl;

  if (!publicId) return null;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
    return result;
  } catch (error) {
    console.warn("Could not delete previous image from Cloudinary:", error?.message || error);
    return null;
  }
};

