const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';

const s3Client = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

async function getPresignedPutUrl(Key, ContentType, Expires = 60) {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key, ContentType });
  return getSignedUrl(s3Client, command, { expiresIn: Expires });
}

async function getSignedGetUrl(Key, Expires = 60) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key });
  return getSignedUrl(s3Client, command, { expiresIn: Expires });
}

function deleteObject(Key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key });
  return s3Client.send(command);
}

async function checkBucketConnectivity() {
  if (!BUCKET) return { ok: false, error: 'S3_BUCKET_NAME not configured' };
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return { ok: true, bucket: BUCKET };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  getPresignedPutUrl,
  getSignedGetUrl,
  deleteObject,
  checkBucketConnectivity,
  BUCKET,
  REGION
};
