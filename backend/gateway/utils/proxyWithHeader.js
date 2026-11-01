import proxy from "express-http-proxy";

export const decorateProxyRequest = (proxyReqOpts, srcReq) => {
  const headers = proxyReqOpts.headers;
  delete headers["x-user-id"];
  delete headers["x-gateway-secret"];

  headers["x-gateway-secret"] = process.env.GATEWAY_SECRET;

  if (srcReq.user?.userId) {
    headers["x-user-id"] = String(srcReq.user.userId);
  }

  return proxyReqOpts;
};

export const proxyWithHeader = (serviceUrl) => {
  return proxy(serviceUrl, {
    parseReqBody: false,
    proxyReqOptDecorator: decorateProxyRequest,

    proxyErrorHandler: (error, res, next) => {
      console.error("[GATEWAY PROXY ERROR]", error.message);

      if (res.headersSent) {
        return next(error);
      }

      return res.status(502).json({
        message: "The backend service could not process the request.",
      });
    },
  });
};
