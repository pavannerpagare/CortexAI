import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cert,
  initializeApp,
  getApps,
} from "firebase-admin/app";

const currentDir = dirname(fileURLToPath(import.meta.url));

const keyPath = join(
  currentDir,
  "..",
  "serviceAccountKey.json"
);

if (!existsSync(keyPath)) {
  throw new Error(
    "Firebase serviceAccountKey.json is missing from the auth folder."
  );
}

const serviceAccount = JSON.parse(
  readFileSync(keyPath, "utf8")
);

if (
  !serviceAccount.project_id ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  throw new Error(
    "Firebase service-account credentials are invalid."
  );
}

export const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });