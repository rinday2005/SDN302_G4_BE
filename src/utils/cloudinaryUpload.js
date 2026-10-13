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
