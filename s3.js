const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config(); // .env 파일에서 환경 변수 로드

// S3 클라이언트 설정
const s3 = new S3Client({
    region: process.env.AWS_REGION || "ap-northeast-2", // S3 버킷의 리전
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID, // AWS Access Key
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // AWS Secret Key
    },
});

// 버킷 이름
const bucketName = process.env.AWS_BUCKET_NAME;

// 파일 업로드 함수 추가
async function uploadFileToS3(key, body, contentType) {
    const params = {
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
    };

    try {
        // PutObjectCommand 명령을 사용하여 S3에 파일 업로드
        const command = new PutObjectCommand(params);
        const result = await s3.send(command);
        console.log("S3 업로드 성공:", result);
        return result;
    } catch (error) {
        console.error("S3 업로드 실패:", error);
        throw new Error("Failed to upload file to S3");
    }
}

// 모듈 내보내기
module.exports = { s3, bucketName, uploadFileToS3 };