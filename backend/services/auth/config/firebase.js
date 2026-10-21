import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const currentDir = dirname(fileURLToPath(import.meta.url));
const keyPath = join(currentDir, "..", "serviceAccountKey.json");

if (!existsSync(keyPath)) {
  throw new Error("Missing auth/serviceAccountKey.json");
}

const serviceAccount = JSON.parse(
  readFileSync(keyPath, "utf8")
);

if (
  !serviceAccount.project_id ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  throw new Error("Firebase service-account credentials are incomplete.");
}

const app = getApps().find((item) => item.name === "[DEFAULT]") ??
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

export const adminAuth = getAuth(app);
