import multer from 'multer';

// 1. Lưu buffer trên RAM
const storage = multer.memoryStorage();

// 2. Chặn .exe, .pdf... chỉ nhận jpeg, png, webp
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Chỉ chấp nhận file ảnh (image/jpeg, image/png, image/webp)!');
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter,
});

export default upload;