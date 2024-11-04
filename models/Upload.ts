// models/uploadSchema.js

import mongoose from "mongoose";

const uploadSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  // filetype: { type: String, required: true },
  // size: { type: Number, required: true },
  // uploadUrl: { type: String },
  status: {
    type: String,
    enum: ["in-progress", "error", "complete"],
    default: "in-progress",
  },
});

export default mongoose.models.Upload || mongoose.model("Upload", uploadSchema);
