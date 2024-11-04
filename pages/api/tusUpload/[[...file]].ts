// pages/api/tus.ts
import { NextApiRequest, NextApiResponse } from "next";
import { Server } from "@tus/server";
import { GCSStore } from "@tus/gcs-store";
import { Storage } from "@google-cloud/storage";
import { createServer, IncomingMessage, ServerResponse } from "http";

// Initialize Google Cloud Storage

const storage = new Storage({
  projectId: "to be added",
  credentials: {
    client_email: "to be added",
    private_key: "to be added",
  },
});
// Initialize the GCS store for tus server
const bucket = storage.bucket("zsp-service-hub-exchange-dev");
const gcsStore = new GCSStore({
  bucket,
});

// Initialize the tus server with the GCS store
const tusServer = new Server({
  path: "/api/tusUpload",
  datastore: gcsStore,
});

// Next.js API handler for tus server
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const method = req.method ?? "";

  // Only allow methods supported by the tus server (PATCH, POST, OPTIONS, HEAD)
  if (!["POST", "PATCH", "OPTIONS", "HEAD"].includes(method)) {
    res.setHeader("Allow", ["POST", "PATCH", "OPTIONS", "HEAD"]);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  return new Promise<void>((resolve) => {
    // Convert Next.js request to a format that the tus server expects
    const serverReq = req as IncomingMessage;
    const serverRes = res as ServerResponse;

    tusServer
      .handle(serverReq, serverRes)
      .then(() => resolve())
      .catch((error) => {
        console.error("Error handling tus request:", error);
        res.status(500).json({ error: "Server error" });
        resolve();
      });
  });
}

// Config to allow larger file sizes
export const config = {
  api: {
    bodyParser: false, // Disable body parsing to use tus
  },
};
