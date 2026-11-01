import { timingSafeEqual } from "node:crypto";

const requireGateway = (req, res, next) => {
  const expectedSecret = process.env.GATEWAY_SECRET;
  const suppliedSecret = req.get("x-gateway-secret");

  if (typeof expectedSecret !== "string" || typeof suppliedSecret !== "string") {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);

  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  return next();
};

export default requireGateway;