import multer from "multer";
import path from "node:path";

const allowedExtensions = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".docx",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(
      file.originalname || ""
    ).toLowerCase();

    if (!allowedExtensions.has(ext)) {
      return callback(
        new Error(
          "Unsupported file type. Upload PDF, TXT, Markdown, or DOCX."
        )
      );
    }

    callback(null, true);
  },
});

export function uploadSingleDocument(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      return next();
    }

    const status =
      error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({
      message: error.message || "Document upload failed.",
    });
  });
}

export default uploadSingleDocument;