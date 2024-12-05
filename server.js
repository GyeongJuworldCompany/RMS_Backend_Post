const express = require("express"); //웹 서버 기능을 구현하기 위한 프레임워크입니다.
const multer = require("multer"); //파일 업로드를 위한!!
const path = require("path"); // path 모듈 불러오기
const cors = require("cors");
const ejs = require("ejs"); //템플릿 엔진으로, 서버 측에서 HTML 뷰를 동적으로 생성할 수 있게 도와줍니다.
const bodyParser = require("body-parser"); // Express 애플리케이션에서 폼 데이터를 처리하기 위해
const fs = require("fs"); //파일 시스템을 다루기 위한 모듈입니다.
const https = require("https"); // Import HTTPS module
const moment = require("moment"); // 파일 이름 지어지는 방식을 위해 !
const proxy = require("express-http-proxy");

const app = express(); //Express 애플리케이션의 인스턴스를 생성합니다.

// 로컬에 저장할때 
// const storage = multer.diskStorage({
//   // 파일은 uploads폴더에 저장이 되고
//   destination: function (req, file, cb) {
//     // uploads 아래 날짜 폴더를 생성!
//     const date = moment().format("YYYY-MM-DD");
//     const dir = path.join(__dirname, "uploads", date);

//     // 없으면 만들어야지!
//     if (!fs.existsSync(dir)) {
//       fs.mkdirSync(dir, { recursive: true }); // Ensure that the directory is created if it does not exist
//     }

//     cb(null, dir);
//   },
//   filename: function (req, file, cb) {
//     const now = moment();
//     const formattedTime = now.format("YYYYMMDDHHmmssSSS");

//     // const originalName = file.originalname;
//     // const fileName = file.fieldname + "-" + formattedTime +originalName;

//     const randomNum = Math.random().toString(36).substring(2, 15); // 난수 생성
//     const extension = file.originalname.split(".").pop(); // 파일 확장자

//     // // MOV(아이폰 확장자!)를 MP4로 변경
//     // if (extension.toLowerCase() === "mov") {
//     //     extension = "mp4";
//     // }

//     const fileName =
//       file.fieldname + "-" + formattedTime + randomNum + "." + extension;

//     cb(null, fileName);
//   },
// });

// s3에 저장!
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });
// cors 요청을 위한 옵션!!! (== cors 정책 설정!)
const options = {
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "X-Access-Token",
    "Authorization",
    "Accept-Language",
    "cache-control",
  ],
  credentials: true,
  methods: "GET,OPTIONS,PUT,PATCH,POST,DELETE",
  origin: "*", // 모든 출처에서의 요청을 허용합니다 ('*').
  preflightContinue: false,
};

app.use(bodyParser.urlencoded({ extended: true })); //URL-encoded 형식의 데이터를 파싱합니다.
app.use(express.urlencoded({ extended: true })); // 폼 데이터 파싱을 위해 필요
app.use(bodyParser.json()); // JSON 형식의 데이터를 파싱할 수 있도록 설정
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.use(cors(options)); //cors 옵션 조건을 사용한다!
// express.static 미들웨어를 사용하여 업로드된 파일들이 있는 폴더를 정적 리소스로 설정할 수 있습니다(파일에 접근 가능하게 해준다)
// app.use('/uploads', express.static('uploads'));
app.use("/uploads/:date", function (req, res, next) {
  const date = req.params.date;
  const dir = path.join(__dirname, "uploads", date);

  // Express.static serves the directory dynamically
  express.static(dir)(req, res, next);
});

app.use(
  "/report/*",
  proxy(
    (req) => {
      const token = req.query.token;
      const workbook = req.query.workbook;
      const view = req.query.view;
      const targetUrl = `http://smart.gjw.co.kr:8000/trusted/${token}/views/${workbook}/${view}`;
      console.log(`Routing to: ${targetUrl}`);
      return targetUrl;
    },
    {
      proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        proxyReqOpts.headers["X-Custom-Header"] = "value";

        if (srcReq.body) {
          const bodyData = JSON.stringify(srcReq.body);
          proxyReqOpts.headers["Content-Length"] = Buffer.byteLength(bodyData);
          proxyReqOpts.body = bodyData;
        }

        return proxyReqOpts;
      },
      userResHeaderDecorator: (
        headers,
        userReq,
        userRes,
        proxyReq,
        proxyRes
      ) => {
        if (headers["set-cookie"]) {
          headers["set-cookie"] = headers["set-cookie"].map((cookie) =>
            cookie.replace(/;(\s*)SameSite=Lax/, ";$1SameSite=None; Secure")
          );
        }
        headers["x-frame-options"] = "ALLOW-FROM https://risk.gjw.co.kr";
        headers["content-security-policy"] =
          "frame-ancestors 'self' https://risk.gjw.co.kr";
        return headers;
      },
      proxyErrorHandler: (err, res, next) => {
        console.error("Proxy error:", err);
        res.status(500).send("Proxy error occurred.");
      },
    }
  )
);

// EJS 뷰 엔진 설정
app.set("view engine", "ejs");
app.set("views", "./server/routers/views"); // view 위치 찾아서 할당!

// 라우터 설정 (main.js에 upload를 인자로 추가합니다)
const router = require("./server/routers/main")(app, upload); // 라우터 모듈을 불러오고 app 및 upload 인스턴스를 전달

// Load SSL key and certificate
const privateKey = fs.readFileSync(
  "./SSL/KeyFile_Wildcard.gjw.co.kr_pem.key",
  "utf8"
);
const certificate = fs.readFileSync("./SSL/Wildcard.gjw.co.kr_pem.pem", "utf8");
const credentials = { key: privateKey, cert: certificate };

// Create HTTPS server
const httpsServer = https.createServer(credentials, app);

// Run HTTPS server on port 3001
httpsServer.listen(3001, function () {
  console.log("3001 포트로 HTTPS server가 실행중입니다~!!");
});
