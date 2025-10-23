import { S3Client } from "@aws-sdk/client-s3";

// Make S3 client optional - only create if credentials are available
export const s3Client = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID 
  ? new S3Client({
      region: "auto",
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "",
      },
    })
  : null;

// Helper function to check if object storage is configured
export const isObjectStorageConfigured = () => {
  return Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);
};
