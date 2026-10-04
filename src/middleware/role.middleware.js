const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      error.errorCode = "UNAUTHORIZED";
      return next(error);
    }

    if (!allowedRoles.includes(req.user.role)) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      error.errorCode = "FORBIDDEN";
      return next(error);
    }

    next();
  };
};

export default authorize;