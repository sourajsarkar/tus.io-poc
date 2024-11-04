"use client";
import * as tus from "tus-js-client";
import ago from "s-ago";
import React, { useCallback, useState } from "react";
import prettyBytes from "pretty-bytes";

export function UploadFile() {
  const [upload, setUpload] = useState<tus.Upload | null>(null);
  const [previousUploads, setPreviousUploads] = useState<tus.PreviousUpload[]>(
    []
  );
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [showPreviousUploads, setShowPreviousUploads] = useState(false);
  const [isUploadRunning, setIsUploadRunning] = useState(false);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState("0%");
  const [progressText, setProgressText] = useState("");

  const startUpload = useCallback(() => {
    if (!upload) return;

    upload.options.onError = (error) => {
      console.error("Upload error:", error);
      if (error instanceof tus.DetailedError && error.originalRequest) {
        const retry = window.confirm(
          "The upload was interrupted by a network failure or server error. Retry?"
        );
        if (retry) upload.start();
      } else {
        window.alert("Failed because: " + error.message);
      }
      setIsUploadRunning(false);
      setUpload(null);
    };

    upload.options.onProgress = async (bytesUploaded, bytesTotal) => {
      const width = `${((bytesUploaded / bytesTotal) * 100).toFixed(2)}%`;
      setProgressBarWidth(width);
      setProgressText(
        `Uploaded ${prettyBytes(bytesUploaded)} of ${prettyBytes(
          bytesTotal
        )} (${width})`
      );
    };

    upload.options.onSuccess = async () => {
      setShowUploadProgress(false);
      setIsUploadComplete(true);
      // Notify server of successful upload
      if (upload.file instanceof File) {
        await fetch("/api/uploadProgress", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Tus-resumable": "1.0.0",
          },
          body: JSON.stringify({
            filename: upload.file.name,
            filetype: upload.file.type,
            size: upload.file.size,
            uploadUrl: upload.url,
            status: "complete",
          }),
        });
      }
    };

    setShowPreviousUploads(false);
    setShowUploadProgress(true);
    setIsUploadRunning(true);
    upload.start();
  }, [upload]);
  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      const file = event.target.files[0];
      if (!file) return;

      // Example file type/size check
      if (file.size > 200 * 1024 * 1024) {
        window.alert("File size should be under 200MB");
        return;
      }
      const options = {
        endpoint: "/api/tusUpload",
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        addRequestId: true,
        onError: (error: any) => {
          console.error("Upload error:", error);
        },
        onProgress: (bytesUploaded: any, bytesTotal: any) => {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
          console.log(`Uploaded ${percentage}%`);
        },
        onSuccess: () => {
          console.log("Upload complete!");
        },
      };

      const newUpload = new tus.Upload(file, options);
      const allPreviousUploads = await newUpload.findPreviousUploads();
      const recentUploads = allPreviousUploads
        .filter(
          (upload) =>
            new Date(upload.creationTime).getTime() >
            Date.now() - 3 * 60 * 60 * 1000
        )
        .sort(
          (a, b) =>
            new Date(b.creationTime).getTime() -
            new Date(a.creationTime).getTime()
        );

      setUpload(newUpload);
      setPreviousUploads(recentUploads);
      setShowPreviousUploads(recentUploads.length > 0);
    },
    []
  );

  return (
    <div className="flex flex-col items-center p-6 bg-gray-50 min-h-screen">
      <div className="bg-white shadow-lg rounded-lg p-6 max-w-lg w-full">
        {upload === null ? (
          <>
            <label className="block text-lg font-semibold text-gray-800 mb-3">
              Select a file to upload
            </label>
            <input
              type="file"
              onChange={handleChange}
              className="border border-gray-300 rounded-md w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </>
        ) : (
          <>
            <button
              onClick={startUpload}
              className="w-full px-4 py-2 mb-6 bg-green-500 text-white rounded-md font-semibold shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              Start Upload
            </button>

            {showUploadProgress && (
              <div className="w-full mb-4">
                <p className="text-lg font-medium text-gray-800 mb-3">
                  {isUploadRunning ? "Uploading..." : "Upload Paused"}
                </p>
                <div className="relative w-full h-4 bg-gray-200 rounded-full mb-2 overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
                    style={{ width: progressBarWidth }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{progressText}</p>
                <button
                  onClick={async () => {
                    if (isUploadRunning) {
                      upload.abort();
                      setIsUploadRunning(false);

                      if (upload.file instanceof File) {
                        await fetch("/api/uploadProgress", {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            "Tus-resumable": "1.0.0",
                          },
                          body: JSON.stringify({
                            filename: upload.file.name,
                            status: "in-progress",
                          }),
                        });
                      }
                    } else {
                      upload.start();
                      setIsUploadRunning(true);
                    }
                  }}
                  className="w-full px-4 py-2 bg-yellow-500 text-white rounded-md font-semibold shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  {isUploadRunning ? "Pause" : "Resume"}
                </button>
              </div>
            )}

            {showPreviousUploads && (
              <div className="w-full mb-4">
                <p className="text-lg font-medium text-gray-800 mb-3">
                  You already started uploading this file{" "}
                  {ago(new Date(previousUploads[0].creationTime))}. Resume?
                </p>
                <div className="flex justify-between">
                  <button
                    onClick={() => {
                      upload.resumeFromPreviousUpload(previousUploads[0]);
                      startUpload();
                    }}
                    className="px-4 py-2 w-1/2 mr-2 bg-blue-500 text-white rounded-md font-semibold shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    Yes, Resume
                  </button>
                  <button
                    onClick={startUpload}
                    className="px-4 py-2 w-1/2 bg-gray-500 text-white rounded-md font-semibold shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    No, Start Over
                  </button>
                </div>
              </div>
            )}

            {isUploadComplete && (
              <div className="w-full text-center mt-6">
                <p className="text-lg font-medium text-green-700 mb-3">
                  Upload Complete!
                </p>
                <button
                  onClick={() => {
                    setUpload(null);
                    setPreviousUploads([]);
                    setShowUploadProgress(false);
                    setShowPreviousUploads(false);
                    setIsUploadComplete(false);
                  }}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-md font-semibold shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  Upload Another File
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
