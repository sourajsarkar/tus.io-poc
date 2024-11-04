import { Storage } from "@google-cloud/storage";

// Initialize storage client using Application Default Credentials
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME!);

export { bucket };
