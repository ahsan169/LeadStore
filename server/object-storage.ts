import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
  throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
}

export const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "",
  },
});
