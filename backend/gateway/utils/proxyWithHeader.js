import proxy from "express-http-proxy";

export const proxyWithHeader = (serviceUrl) => {
  return proxy(serviceUrl, {
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      const userId = srcReq.user?.userId ? String(srcReq.user.userId) : null;

      delete srcReq.headers["x-user-id"];
      delete proxyReqOpts.headers["x-user-id"];

      if (userId) {
        proxyReqOpts.headers["x-user-id"] = userId;
      }

      if (process.env.GATEWAY_SECRET) {
        proxyReqOpts.headers["x-gateway-secret"] = process.env.GATEWAY_SECRET;
      }

      return proxyReqOpts;
    },
  });
};
