import express from 'express';
import upload from '../middleware/upload.middleware.js';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

router.post('/upload', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
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
        });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    next(err);
  }
});

export default router;