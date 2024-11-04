import { Storage } from "@google-cloud/storage";
import * as path from "path";
import fileType from "file-type";

/**
 * DocsStore is the interface for the services which will implement the functionality
 * to store the document
 */
export interface DocsStore {
  /**
   * Store the provided document which is a buffer to a permanent storage like, S3
   */
  store(buf: Buffer, filename: string, exp: number): Promise<void>;

  /**
   * Get the URL which is signed and expires after some time
   * @param filename the file which you need the public access to
   * @param exp the millisecond time after which the URL will be expired
   */
  getExpirableURL(filename: string, exp: number): Promise<string>;
  download(filePath: string, fileName: string): Promise<boolean>;
  upload(buffer: Buffer, fileName: string, isPublic?: boolean): Promise<void>;
}

export class CloudStorageGCP implements DocsStore {
  private static storageInstance: Storage | null = null;
  private static instances: { [bucket: string]: CloudStorageGCP } = {};
  private storage: Storage;
  private bucket: string;

  private constructor(bucket: string) {
    this.bucket = bucket;

    if (!CloudStorageGCP.storageInstance) {
      CloudStorageGCP.storageInstance = new Storage({
        // keyFilename: path.join(__dirname, "../gcp/service-account.json"),
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });
    }

    this.storage = CloudStorageGCP.storageInstance;
  }

  public static getInstance(bucket: string): CloudStorageGCP {
    if (!CloudStorageGCP.instances[bucket]) {
      CloudStorageGCP.instances[bucket] = new CloudStorageGCP(bucket);
    }
    return CloudStorageGCP.instances[bucket];
  }

  public async getUploadExpirableUrl(fileName: string, expiresIn: number) {
    try {
      const [url] = await this.storage
        .bucket(this.bucket)
        .file(fileName)
        .getSignedUrl({
          version: "v4",
          action: "write",
          expires: expiresIn,
          contentType: "application/octet-stream",
        });
      return url;
    } catch (error) {
      console.error("Error while generating expirable url for upload", {
        error: error,
        bucket_name: this.bucket,
        file_name: fileName,
        expiresIn: expiresIn,
      });
      return "";
    }
  }

  public async getExpirableURL(
    filePath: string,
    expiresIn: number
  ): Promise<string> {
    try {
      const [url] = await this.storage
        .bucket(this.bucket)
        .file(filePath)
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires: expiresIn,
        });
      return url;
    } catch (error) {
      console.error("Error while generating expirable url", {
        error: error,
        bucket_name: this.bucket,
        file_name: filePath,
        expiresIn: expiresIn,
      });
      return "";
    }
  }

  public async store(buf: Buffer, filePath: string): Promise<void> {
    try {
      const bucketStore = this.storage.bucket(this.bucket);

      const file = bucketStore.file(filePath);
      const stream = file.createWriteStream({
        metadata: {
          contentType: (await fileType.fileTypeFromBuffer(buf))?.mime,
        },
        resumable: false,
      });

      await new Promise<void>((resolve, reject) => {
        stream.on("error", (error) => {
          console.error({
            message: "Got error event while storing the document",
            error,
          });
          reject(error);
        });

        stream.on("finish", () => {
          resolve();
        });

        stream.end(buf);
      });
    } catch (error: any) {
      console.error("Error while storing document in bucket:", error);
      console.error({
        message: "Error while storing the document",
        bucket_name: this.bucket,
        file_path: filePath,
        error: error.message ?? error,
      });
      throw error; // Rethrow the error to be caught by the caller
    }
  }

  public async copyToAnotherBucket(
    sourceFilePath: string,
    targetBucketName: string,
    targetFilePath: string
  ): Promise<void> {
    try {
      const sourceBucket = this.storage.bucket(this.bucket);
      const sourceFile = sourceBucket.file(sourceFilePath);

      const targetBucket = this.storage.bucket(targetBucketName);
      const targetFile = targetBucket.file(targetFilePath);

      await sourceFile.copy(targetFile);
    } catch (error) {
      console.error({
        message: "Error while copying the document to another bucket",
        source_bucket_name: this.bucket,
        source_file_path: sourceFilePath,
        target_bucket_name: targetBucketName,
        target_file_path: targetFilePath,
        error,
      });
      throw error;
    }
  }

  public async download(filePath: string, fileName: string): Promise<boolean> {
    const downlaodOptions = {
      destination: filePath,
    };

    try {
      await this.storage
        .bucket(this.bucket)
        .file(fileName)
        .download(downlaodOptions);
      return true;
    } catch (error) {
      console.error("Error while downloading the document", {
        error,
        bucket_name: this.bucket,
        file_path: filePath,
        file_name: fileName,
      });
      throw error;
    }
  }

  public async upload(buffer: Buffer, fileName: string, isPublic?: boolean) {
    try {
      const file = this.storage.bucket(this.bucket).file(fileName);

      // Save the file
      await file.save(buffer);
    } catch (error: any) {
      console.error("Error while uploading document in bucket:", error);
      console.error({
        message: "Error while uploading the document",
        bucket_name: this.bucket,
        file_path: fileName,
        error: error.message ?? error,
      });
      throw error;
    }
  }

  public async bulkUpload(
    files: { buffer: Buffer; fileName: string; isPublic: boolean }[]
  ): Promise<{ successful: string[]; failed: string[] }> {
    const successful: string[] = [];
    const failed: string[] = [];

    const uploadPromises = files.map(async (fileData) => {
      const { buffer, fileName } = fileData;
      const bucketStore = this.storage.bucket(this.bucket);
      const file = bucketStore.file(fileName);

      try {
        await file.save(buffer, {
          metadata: {
            contentType: (await fileType.fileTypeFromBuffer(buffer))?.mime,
          },
          resumable: false,
        });
        if (fileData.isPublic) {
          await file.makePublic();
        }
        successful.push(fileName);
      } catch (error) {
        console.error({
          message: `Error while uploading the document`,
          bucket_name: this.bucket,
          file_name: fileName,
          error,
        });
        failed.push(fileName);
      }
    });

    try {
      // Wait for all uploads to complete.
      await Promise.all(uploadPromises);
    } catch (error) {
      console.error({
        message: "Error while uploading batch of documents",
        error,
      });
    }

    return { successful, failed };
  }

  public async delete(filePath: string) {
    try {
      const file = this.storage.bucket(this.bucket).file(filePath);

      const exists = await file.exists();

      if (exists[0]) {
        // File exists, proceed with deletion
        await file.delete();
      } else {
        console.error(
          "Error while deleting the document since file doesnt exist",
          {
            bucket_name: this.bucket,
            file_path: filePath,
          }
        );
      }
    } catch (error) {
      console.error("Error while deleting the document", {
        error,
        bucket_name: this.bucket,
        file_path: filePath,
      });
    }
  }

  private async listFileByPrefix(prefix: string, delimiter?: string) {
    const options: any = {
      prefix: prefix,
    };

    if (delimiter) {
      options.delimiter = delimiter;
    }
    // console.log(this.bucket, options)
    const [files] = await this.storage.bucket(this.bucket).getFiles(options);
    // console.log(files)
    return files;
  }

  /**
   * download the folder at the file path
   * @param remotePath - directory path of the remote cloud storage
   * @param filePath - file path to download the files
   */

  /**
   * delete the complete directory from the bucket
   * @param remotePath - directory path of the remote cloud storage
   */

  /**
   *
   * @param expiry - expiry in milliseconds
   * @returns
   */
  /**
   *
   * @param files - all the file path for signed url
   * @param expiry - expiry for the object
   * @returns
   */
  public async bulkReadExpirableURL(files: string[], expiry: number) {
    if (files) {
      const promises = files.map((file) => this.getExpirableURL(file, expiry));
      return await Promise.all(promises);
    }
  }

  public async getFileBuffer(fileName: string): Promise<Buffer> {
    try {
      const [file] = await this.storage
        .bucket(this.bucket)
        .file(fileName)
        .download();

      // Convert the file content to a buffer
      const fileBuffer = Buffer.from(file);

      return fileBuffer;
    } catch (error) {
      console.error("Error while getting document buffer", {
        error,
        bucket_name: this.bucket,
        file_name: fileName,
      });
      throw error;
    }
  }

  public async moveFolderToAnotherBucket(
    sourceFolderPath: string,
    targetBucketName: string,
    targetFolderPath: string
  ): Promise<void> {
    try {
      const sourceBucket = this.storage.bucket(this.bucket);
      const targetBucket = this.storage.bucket(targetBucketName);

      const [files] = await sourceBucket.getFiles({ prefix: sourceFolderPath });

      for (const file of files) {
        const targetFilePath = `${targetFolderPath}${file.name.replace(
          sourceFolderPath,
          ""
        )}`;
        const targetFile = targetBucket.file(targetFilePath);

        // Copy the file to the target bucket
        await file.copy(targetFile);

        // Delete the file from the source bucket
        await file.delete();
      }

      console.debug({
        message: "Folder moved successfully",
        source_bucket_name: this.bucket,
        source_folder_path: sourceFolderPath,
        target_bucket_name: targetBucketName,
        target_folder_path: targetFolderPath,
      });
    } catch (error) {
      console.error({
        message: "Error while moving the folder to another bucket",
        source_bucket_name: this.bucket,
        source_folder_path: sourceFolderPath,
        target_bucket_name: targetBucketName,
        target_folder_path: targetFolderPath,
        error,
      });
      throw error;
    }
  }

  public async deleteFolder(folderPath: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucket);

      // Get all files with the given prefix (folder path)
      const [files] = await bucket.getFiles({ prefix: folderPath });

      if (files.length === 0) {
        console.info({
          message: "No files found in the folder",
          bucket_name: this.bucket,
          folder_path: folderPath,
        });
        return;
      }

      // Delete all the files in the folder
      await Promise.all(files.map((file) => file.delete()));

      console.debug({
        message: "Folder deleted successfully",
        bucket_name: this.bucket,
        folder_path: folderPath,
      });
    } catch (error) {
      console.error({
        message: "Error while deleting the folder",
        bucket_name: this.bucket,
        folder_path: folderPath,
        error,
      });
      throw error;
    }
  }
}
