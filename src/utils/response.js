const successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (
  res,
  message,
  errorCode = "INTERNAL_SERVER_ERROR",
  statusCode = 500
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
};

export {
  successResponse,
  errorResponse,
};