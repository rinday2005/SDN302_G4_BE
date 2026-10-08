/**
 * Auth Module - Model
 *
 * Auth module does not define its own Mongoose schema.
 * It reuses the User model from the user module for all
 * authentication-related database operations (register, login, etc.).
 *
 * Re-exported here for convenient access within the auth module.
 */
export { default } from "../user/user.model.js";
