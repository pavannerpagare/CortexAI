import { timingSafeEqual } from "node:crypto";

const requireGateway = (req, res, next) => {
  const expected = process.env.GATEWAY_SECRET;
  const received = req.get("x-gateway-secret");

  if (!expected) {
    console.error("GATEWAY_SECRET is not configured.");
    return res.status(500).json({
      message: "Gateway authentication is not configured",
    });
  }

  if (!received) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
};

export default requireGateway;