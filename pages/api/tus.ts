import { Storage } from "@google-cloud/storage";
import { NextApiRequest, NextApiResponse } from "next";

// Initialize the GCS storage instance
const storage = new Storage({
  projectId: "to be added",
  credentials: {
    client_email:
      "to be added",
    private_key:
      "to be added"
  },
});

const bucketName = "zsp-service-hub-exchange-dev";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "110mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { filename, filetype, buffer } = req.body;
    if (!filename || !filetype || !buffer) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const fileBuffer = Buffer.from(buffer, "base64");
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filename);

    await file.save(fileBuffer, { contentType: filetype });
    console.log(`File ${filename} uploaded to ${bucketName}`);

    res.status(200).json({ message: "Upload successful", filename });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed", details: error });
  }
}

/////gcp 


