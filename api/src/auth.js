import bcrypt from "bcryptjs";

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};
