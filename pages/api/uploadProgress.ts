// pages/api/uploadFile.js

import connectToDatabase from "@/lib/mongo";
import Upload from "@/models/Upload";

export default async function handler(req: any, res: any) {
  await connectToDatabase(); // Connect to MongoDB using cached connection

  const { method } = req;

  if (method === "POST") {
    try {
      const { filename, status } = req.body;
      if (!filename || !status) {
        return res
          .status(400)
          .json({ error: "Missing required fields: filename or status." });
      }
      const newUpload = new Upload({
        filename,
        status,
      });

      await newUpload.save();
      res.status(201).json({ message: "Upload data saved successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to save upload data." });
    }
  } else if (method === "PATCH") {
    try {
      const { filename, status } = req.body;
      console.log(filename, status, "dwjfgeuv");

      // Check if document exists
      const existingUpload = await Upload.findOne({ filename });

      if (!existingUpload) {
        // Optionally create a new document if none exists
        const newUpload = new Upload({ filename, status });
        console.log(newUpload, "helllooooo");
        await newUpload.save();
        return res
          .status(201)
          .json({ message: "New upload created and progress updated." });
      }

      res.status(200).json({ message: "Upload updated successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to update upload data." });
    }
  } else {
    res.setHeader("Allow", ["POST", "PATCH"]);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}
