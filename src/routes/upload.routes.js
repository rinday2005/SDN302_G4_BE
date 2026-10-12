import express from 'express';
import upload from '../middleware/upload.middleware.js';
import cloudinary from '../config/cloudinary.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { uploadAvatarController } from '../modules/user/user.controller.js';

const router = express.Router();

router.post('/upload', upload.any(), (req, res, next) => {
  try {
    const file =
      req.file ||
      req.files?.file?.[0] ||
      req.files?.avatar?.[0] ||
      req.files?.image?.[0] ||
      (Array.isArray(req.files) ? req.files[0] : null);

    if (!file) {
      return res.status(400).json({ message: 'Vui lòng cung cấp file ảnh' });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'reuse_hub',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return next(error);
        return res.status(200).json({
          message: 'Upload ảnh thành công',
          url: result.secure_url,
          avatarUrl: result.secure_url,
          data: {
            url: result.secure_url,
            avatarUrl: result.secure_url,
            secure_url: result.secure_url,
          },
        });
      }
    );

    uploadStream.end(file.buffer);
  } catch (err) {
    next(err);
  }
});

// Route fallback for FE: POST /upload/avatar
router.post(
  '/upload/avatar',
  optionalAuthMiddleware,
  upload.any(),
  uploadAvatarController
);

export default router;