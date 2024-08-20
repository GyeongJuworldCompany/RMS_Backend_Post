// db.js에서 poolPromise를 가져옵니다.
// 비동기 처리를 위해 poolPromise 로 설정!!
const { sql, poolPromise } = require("./db");

// 알리고
const axios = require("axios");
const FormData = require("form-data");

// zwt 토큰
require("dotenv").config(); // 토큰 생성을 위한 시크릿
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs"); // 해쉬 비번을 위한거!

// 파일 이름을 위해!
const moment = require("moment"); // 파일 이름 지어지는 방식을 위해 !

// https 서버를 위해!
const https = require("https");

// 클라이언트에게 받은 id로 등록된 pw를 가져오는 함수
// 모든 필드값 select 함!!
async function getUserById(id) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("userId", sql.VarChar, id)
      .query("SELECT * FROM Account WHERE ID = @userId");

    if (result.recordset.length > 0) {
      // console.log("DB에서 찾은 데이터", result.recordset[0]);  // Log the user record
      return result.recordset[0];
    } else {
      console.log("No user found with ID:", id); // Log if no user is found
      return null;
    }
  } catch (err) {
    console.error("Database error in getUserById:", err);
    throw err;
  }
}

// 로그인할때마다 새로 생기는 토큰을 DB에 저장하는 함수
async function insertLoginToken(id, token) {
  const pool = await poolPromise; // assuming poolPromise is already defined in your code to handle DB connections
  const query = `
    MERGE INTO Account AS target
    USING (VALUES (@id, @token)) AS source (id, token)
    ON target.id = source.id
    WHEN MATCHED THEN
        UPDATE SET token = source.token
    WHEN NOT MATCHED THEN
        INSERT (id, token) VALUES (source.id, source.token);
`;

  return pool
    .request()
    .input("id", sql.VarChar, id) // Adjust SQL type if necessary
    .input("token", sql.VarChar, token)
    .query(query);
}

// Active Access Token 생성
const generateActiveAccessToken = async (payload) => {
  let accessToken = "";
  const secret = process.env.JWT_SECRET || "";
  try {
    accessToken = await jwt.sign(payload, secret);
  } catch (error) {
    console.log(error);
    return accessToken;
  }
  return accessToken;
};

// Token 검증
const verifyToken = async (token, secretKey) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        console.log("verify error");
        return reject(err);
      }
      console.log("resolve success");
      resolve(decoded);
    });
  });
};

const checkLogin = async (req, res, next) => {
  const secret_key = process.env.JWT_SECRET || "";
  const token = req.headers.authorization?.split(" ")[1] || ""; // Typically, tokens are sent as "Bearer <token>"
  // token = JSON.parse(token);

  try {
    if (!token) {
      return res.status(401).json({ error: "YOU_NEED_TO_LOGIN" });
    }

    const decode = await verifyToken(token, secret_key);
    if (!decode) {
      return res.status(403).json({ error: "BAD_SIGNATURE_JWT" });
    }

    const user = await getUserById(decode.id); // Assuming your payload has user 'id'
    if (!user) {
      return res.status(400).json({ error: "USER_NOT_FOUND" });
    }

    req.user = {
      // Attach user details to the request object
      id: user.id,
      UserKey: user.UserKey,
      Auth: user.Auth,
    };

    return next();
  } catch (error) {
    console.log("Error in token verification:", error);
    return res.status(403).json({ error: "BAD_SIGNATURE_JWT" });
  }
};

module.exports = function (app, upload) {
  // 루트 환경에서 Test.ejs 바인딩
  app.get("/", async (req, res) => {
    try {
      const pool = await poolPromise; // poolPromise를 통해 데이터베이스 연결 풀을 얻습니다
      res.render("Test"); // Test.ejs 렌더링
    } catch (err) {
      res.status(500);
      res.render("error", { message: err.message }); // 오류 페이지 렌더링
    }
  });

  // 관리자 신고 접수
  app.post(
    "/create/manager",
    checkLogin,
    upload.fields([
      { name: "preImage", maxCount: 2 },
      { name: "afterImage", maxCount: 2 },
    ]),
    async (req, res) => {
      console.log("Received data:", req.body);

      const {
        Name,
        Place,
        Department,
        Factors,
        BeforeAction,
        BeforeLevel,
        Solution,
        AfterAction,
        AfterLevel,
        DueDate,
        FinishDate,
        Cost,
        Status,
        Manager,
        Handler,
        Date: Date,
        Manager_Handler,
      } = req.body;

      // Manager_Handler를 정수형으로 변환
      const managerHandlerInt = parseInt(Manager_Handler, 10);
      // 변환된 값이 유효한 숫자인지 검증
      if (isNaN(managerHandlerInt)) {
        return res
          .status(400)
          .send("변환된 Manager_Handler가 정수형이 아님!!!");
      }

      const pool = await poolPromise;
      let transaction = new sql.Transaction(pool);

      try {
        await transaction.begin();

        const handlerQuery = `
            SELECT	Handler = EMP_NO,
            Handler_nm = EMP_KOR_NM,
            Handler_dep = GJWD_DBF.DBO.F_DEPT_NM(DEPT_CD),
            Handler_hp = REPLACE(CEL_TEL_NO,'-','') 
            FROM GJWD_DBF..PBB01M00
            WHERE RETIRE_YN = 'N' 
            AND MILL_CD = 'SB' 
            AND EMP_NO = @Manager_Handler
            ORDER BY Handler_dep;
        `;
        const handlerDetails = await pool
          .request()
          .input("Manager_Handler", sql.Int, managerHandlerInt)
          .query(handlerQuery);

        if (handlerDetails.recordset.length === 0) {
          return res.status(404).send("Handler details not found.");
        }

        const handlerName = handlerDetails.recordset[0].Handler_nm; //Handler_nm 사번에 해당하는 사원 이름!!!

        console.log("관리자 이름 : ", handlerName);

        const request = new sql.Request(transaction);
        const managementQuery = `
            INSERT INTO RiskFactorManagement (Date, Name, Place, Department, Factors, BeforeAction, BeforeLevel,
                Solution, AfterAction, AfterLevel, DueDate, FinishDate, Cost, Status, Manager, Handler, Created_At, Created_By, Route)
            VALUES (@Date, '미정', @Place, @Department, @Factors, @BeforeAction, @BeforeLevel,
                @Solution, @AfterAction, @AfterLevel, @DueDate, @FinishDate, @Cost, @Status, @Manager, @Handler, GETDATE(), @Name, '관리자등록')
            SELECT SCOPE_IDENTITY() as RFSeq;
    `;
        request
          .input("Date", sql.VarChar, Date)
          .input("Name", sql.NVarChar, handlerName)
          .input("Place", sql.NVarChar, Place)
          .input("Department", sql.NVarChar, Department)
          .input("Factors", sql.NVarChar, Factors)
          .input("BeforeAction", sql.NVarChar, BeforeAction)
          .input("BeforeLevel", sql.NVarChar, BeforeLevel)
          .input("Solution", sql.NVarChar, Solution)
          .input("AfterAction", sql.NVarChar, AfterAction)
          .input("AfterLevel", sql.NVarChar, AfterLevel)
          .input("DueDate", sql.VarChar, DueDate)
          .input("FinishDate", sql.VarChar, FinishDate)
          .input("Cost", sql.Numeric, Cost ? parseFloat(Cost) : null)
          .input("Status", sql.VarChar, Status)
          .input("Manager", sql.VarChar, Manager)
          .input("Handler", sql.VarChar, Handler); // 문자열로 설정된 handler 값 입력
        const managementResult = await request.query(managementQuery);
        const RFSeq = managementResult.recordset[0].RFSeq;

        // Handling file uploads
        const processFiles = async (files, kind) => {
          for (const file of files) {
            const date = moment().format("YYYY-MM-DD");
            const fileUrl = `${req.protocol}://${req.get(
              "host"
            )}/uploads/${date}/${file.filename}`;

            // Query to get the current max ContentSeq for the given RFSeq and RFKind
            const seqRequest = new sql.Request(transaction);
            seqRequest.input("RFSeq", sql.Int, RFSeq);
            seqRequest.input("RFKind", sql.Char, kind);
            const seqResult = await seqRequest.query(`
            SELECT MAX(ContentSeq) AS maxSeq FROM RiskFactorContents WHERE RFSeq = @RFSeq AND RFKind = @RFKind;
        `);
            const maxSeq = seqResult.recordset[0].maxSeq || 0;
            const newSeq = maxSeq + 1;

            let fileRequest = new sql.Request(transaction);
            fileRequest
              .input("RFSeq", sql.Int, RFSeq)
              .input("RFKind", sql.Char, kind)
              .input("ContentURL", sql.NVarChar, fileUrl)
              .input("ContentSeq", sql.Int, newSeq) // Now dynamically determined
              .input("Created_At", sql.DateTime, new global.Date())
              .input("CreatedBy", sql.NVarChar, handlerName); // `CreatedBy`에 핸들러 이름 삽입
            await fileRequest.query(`
            INSERT INTO RiskFactorContents (RFSeq, RFKind, ContentURL, ContentStatus, ContentSeq, Created_At, Created_By)
            VALUES (@RFSeq, @RFKind, @ContentURL, 'Y', @ContentSeq, @Created_At, @CreatedBy);
        `);
          }
        };

        if (req.files["preImage"]) {
          try {
            await processFiles(req.files["preImage"], "B");
            console.log(
              "Pre Image Files:",
              req.files["preImage"].map((file) => ({
                name: file.originalname,
                size: file.size,
                type: file.mimetype,
              }))
            );
          } catch (err) {
            await transaction.rollback();
            res.status(500).send("Failed to process preImage files.");
            return;
          }
        }

        if (req.files["afterImage"]) {
          try {
            await processFiles(req.files["afterImage"], "A");
            console.log(
              "After Image Files:",
              req.files["afterImage"].map((file) => ({
                name: file.originalname,
                size: file.size,
                type: file.mimetype,
              }))
            );
          } catch (err) {
            await transaction.rollback();
            res.status(500).send("Failed to process afterImage files.");
            return;
          }
        }
        await transaction.commit();
        res.json({
          success: true,
          message: "Management and files successfully added.",
          RFSeq,
        });
      } catch (err) {
        if (transaction) {
          await transaction.rollback();
        }
        console.error("Database error occurred:", err);
        res
          .status(500)
          .send(
            "Error processing the request: " + (err.message || err.toString())
          );
      }
    }
  );

  // 신고자 신고 접수
  // https://10.1.1.30:3001/create
  // https://riskapi.gjw.co.kr:3001/create
  app.get("/create", (req, res) => {
    res.render("create"); //create.ejs 폼 띄워주고
  });
  app.post("/create", upload.array("files"), async (req, res) => {
    console.log(req.body); // 디버그 정보
    console.log(req.files); // 업로드된 파일 정보

    try {
      const {
        Date: ReceivedDate,
        Place,
        Department,
        Name,
        Hp,
        Factors,
        Manager,
      } = req.body;

      const pool = await poolPromise; // poolPromise를 사용하여 데이터베이스 연결 풀을 얻습니다.

      const managementQuery = `INSERT INTO RiskFactorManagement (Date, Place, Department, Name, Hp, Factors, Manager, Created_At, Created_By , Status , Route )
                                     VALUES (@ReceivedDate, @Place, @Department, @Name, @Hp, @Factors, @Manager, @Created_At, @CreatedBy, @Status , @Route);
                                     SELECT SCOPE_IDENTITY() as RFSeq;`;
      const result = await pool
        .request()
        .input("ReceivedDate", sql.VarChar, ReceivedDate)
        .input("Place", sql.NVarChar, Place)
        .input("Department", sql.NVarChar, Department)
        .input("Name", sql.NVarChar, Name)
        .input("Hp", sql.Char, Hp)
        .input("Factors", sql.NVarChar, Factors)
        .input("Manager", sql.Char, Manager)
        .input("Created_At", sql.DateTime, new Date())
        .input("CreatedBy", sql.VarChar, Name || "DefaultUser")
        .input("Status", sql.Char, "접수")
        .input("Route", sql.Char, "신고자등록")
        .query(managementQuery);

      const RFSeq = result.recordset[0].RFSeq;

      if (req.files && req.files.length > 0) {
        const fileInsertions = req.files.map((file, index) => {
          const date = moment().format("YYYY-MM-DD");
          const fileUrl = `${req.protocol}://${req.get(
            "host"
          )}/uploads/${date}/${file.filename}`;
          return pool
            .request()
            .input("RFSeq", sql.Int, RFSeq)
            .input("RFKind", sql.Char, "B")
            .input("ContentURL", sql.VarChar, fileUrl)
            .input("ContentStatus", sql.Char, "Y")
            .input("ContentSeq", sql.Int, index + 1)
            .input("Created_At", sql.DateTime, new Date())
            .input("CreatedBy", sql.VarChar, Name || "DefaultUser").query(`
                            INSERT INTO RiskFactorContents (RFSeq, RFKind, ContentURL, ContentStatus, ContentSeq, Created_At, Created_By)
                            VALUES (@RFSeq, @RFKind, @ContentURL, @ContentStatus, @ContentSeq, @Created_At, @CreatedBy);
                        `);
        });

        await Promise.all(fileInsertions);
      }

      res.send({
        success: true,
        message: "데이터가 성공적으로 추가되었습니다.",
      });
    } catch (err) {
      console.error("데이터베이스 오류 발생:", err);
      res.status(500).send("데이터 추가 중 오류가 발생했습니다.");
    }
  });

  // https://10.1.1.30:3001/select/all
  // https://riskapi.gjw.co.kr:3001/select/all
  app.get("/select/all", async (req, res) => {
    try {
      const pool = await poolPromise; // 데이터베이스 연결 풀을 얻습니다

      /* yyyy-mm-dd형식으로 데이터를 클라이언트에게 보내면 시분초가 나오는데 그거 없애는 쿼리!    
                
                CONVERT(CHAR,컬럼명, 120) AS 컬럼명
                const queryManagement = `
                SELECT 
                    RFSeq,
                    CONVERT(varchar, Date, 23) as Date,
                    Place,
                    Department,
                    Name,
                    Hp,
                    Factors,
                    Created_At,
                    Created_By,
                    Status,
                    Route
                FROM RiskFactorManagement;
            `;
            */

      // RiskFactorManagement 정보 조회
      const queryManagement = `
                SELECT *
                FROM RiskFactorManagement;
            `;

      // RiskFactorContents에서 ContentURL, RFKind, ContentSeq, ContentStatus 조회
      const queryContents = `
                SELECT ContentURL, RFKind, ContentSeq, RFSeq
                FROM RiskFactorContents
                WHERE ContentStatus = 'Y';
            `;

      // Management 정보 조회
      const resultManagement = await pool.request().query(queryManagement);

      // Contents의 ContentURL, RFKind, ContentSeq 조회 (ContentStatus가 'Y'인 것만)
      const resultContents = await pool.request().query(queryContents);

      if (resultManagement.recordset.length > 0) {
        const managementData = resultManagement.recordset; // Management 데이터

        // Map through management data and append contents to each management entry
        const responseData = managementData.map((management) => {
          const contentDetails = resultContents.recordset
            .filter((content) => content.RFSeq === management.RFSeq)
            .map((content) => ({
              ContentURL: content.ContentURL,
              ContentSeq: content.ContentSeq,
              RFKind: content.RFKind,
            }));

          return {
            ...management,
            ContentDetails: contentDetails,
          };
        });

        res.json(responseData); // JSON 형태로 응답
      } else {
        res.status(404).send("데이터가 없습니다.");
      }
    } catch (err) {
      console.error("데이터베이스 오류 발생:", err);
      res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
    }
  });

  // RFSeq 던져주면 해당 데이터 조인해서 클라이언트에게 보내주는 부분
  // ContentURL과 ContentSeq를 짝지어서 배열로 보내고 상태값에 따라 다르게 보내준다!!!
  // ContentStatus가 Y인 데이터만 클라이언트에게 보내준다! => 비활성화 안 된 파일들만!
  app.post("/select/:RFSeq", async (req, res) => {
    const RFSeq = req.params.RFSeq; // URL 파라미터에서 RFSeq 값을 받음

    try {
      const pool = await poolPromise; // 데이터베이스 연결 풀을 얻습니다

      // RiskFactorManagement 정보 조회
      const queryManagement = `
                SELECT *
                FROM RiskFactorManagement
                WHERE RFSeq = @RFSeq;
            `;

      // RiskFactorContents에서 ContentURL, RFKind, ContentSeq, ContentStatus 조회
      const queryContents = `
                SELECT ContentURL, RFKind, ContentSeq
                FROM RiskFactorContents
                WHERE RFSeq = @RFSeq AND ContentStatus = 'Y';
            `;

      // Management 정보 조회
      const resultManagement = await pool
        .request()
        .input("RFSeq", sql.Int, RFSeq)
        .query(queryManagement);

      // Contents의 ContentURL, RFKind, ContentSeq 조회 (ContentStatus가 'Y'인 것만)
      const resultContents = await pool
        .request()
        .input("RFSeq", sql.Int, RFSeq)
        .query(queryContents);

      if (resultManagement.recordset.length > 0) {
        const managementData = resultManagement.recordset[0]; // Management 데이터
        const contentDetailsA = resultContents.recordset
          .filter((item) => item.RFKind === "A")
          .map((item) => ({
            ContentURL: item.ContentURL,
            ContentSeq: item.ContentSeq,
          }));
        const contentDetailsB = resultContents.recordset
          .filter((item) => item.RFKind === "B")
          .map((item) => ({
            ContentURL: item.ContentURL,
            ContentSeq: item.ContentSeq,
          }));

        // 응답 데이터 구성
        const responseData = {
          ...managementData,
          ContentDetails_A: contentDetailsA,
          ContentDetails_B: contentDetailsB,
        };

        res.json(responseData); // JSON 형태로 응답
      } else {
        res.status(404).send("해당 RFSeq에 대한 데이터가 없습니다.");
      }
    } catch (err) {
      console.error("데이터베이스 오류 발생:", err);
      res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
    }
  });

  // 담당자 리스트 보여주는 부분!!
  // https://10.1.1.30:3001/select/emp_List
  // https://riskapi.gjw.co.kr:3001/select/emp_List
  app.get("/select/emp_List", async (req, res) => {
    try {
      const pool = await poolPromise;
      const query = `
      SELECT	Handler = EMP_NO,
      Handler_nm = EMP_KOR_NM,
      Handler_dep = GJWD_DBF.DBO.F_DEPT_NM(DEPT_CD),
      Handler_team = GJWD_DBF.DBO.F_DEPT_team_NM(DEPT_CD),
      Handler_hp = REPLACE(CEL_TEL_NO,'-','')
      FROM	GJWD_DBF..PBB01M00
      WHERE	RETIRE_YN = 'N'          --재직자만 필요하시면('N') , 퇴사자를 포함한 전체 사원정보가 필요한 경우는 조건 빼시면 됩니다.
      AND MILL_CD = 'SB'
      AND GJWD_DBF.DBO.F_DEPT_team_NM(DEPT_CD) IS NOT NULL 
      ORDER BY Handler_dep;
            `;
      const result = await pool.request().query(query);

      if (result.recordset.length > 0) {
        const grouped = result.recordset.reduce((acc, item) => {
          // Create a new group if it doesn't exist
          if (!acc[item.Handler_team]) {
            acc[item.Handler_team] = [];
          }
          // Push the current item into its corresponding group
          acc[item.Handler_team].push({
            Handler: item.Handler,
            Handler_nm: item.Handler_nm,
            Handler_hp: item.Handler_hp,
          });
          return acc;
        }, {});

        // Convert object to array
        const output = Object.entries(grouped).map(([team, employees]) => ({
          Handler_team: team,
          Employees: employees,
        }));

        res.json(output);
      } else {
        res.status(404).send("No employee data found.");
      }
    } catch (err) {
      console.error("Failed to retrieve employee data:", err);
      res.status(500).send("Error accessing the database");
    }
  });

  // 기간 보내주면 해당 데이터 보내주기!!
  // https://10.1.1.30:3001/select_range
  // https://riskapi.gjw.co.kr:3001/select_range
  app.get("/select_range", (req, res) => {
    res.render("select_range"); // select_range.ejs 뷰를 렌더링하여 클라이언트에게 보여줍니다.
  });
  app.post("/select_range", async (req, res) => {
    const { startDate, endDate, option, Department } = req.body;

    try {
      // 날짜 데이터를 ISO 8601 형식 (YYYY-MM-DD)으로 변환
      const formattedStartDate = new Date(startDate)
        .toISOString()
        .substring(0, 10);
      const formattedEndDate = new Date(endDate).toISOString().substring(0, 10);

      console.log("수신된 날짜:", { formattedStartDate, formattedEndDate });
      console.log("수신된 옵션:", option);
      console.log("수신된 부서:", Department);

      const pool = await poolPromise;
      let query = `
        SELECT 
          RFM.RFSeq, 
          CONVERT(varchar, RFM.Date, 23) as Date, 
          RFM.Place, 
          RFM.Factors,
          RFM.BeforeAction,
          RFM.BeforeLevel,
          RFM.Department, 
          RFM.Name, 
          RFM.Hp,
          RFM.Manager,
          RFM.Handler,
          RFM.ReceiptDate,
          RFM.DueDate,
          RFM.FinishDate,
          RFM.Solution,
          RFM.AfterAction,
          RFM.AfterLevel,
          RFM.Cost,
          RFM.Status, 
          RFM.Route, 
          RFM.Created_At, 
          RFM.Created_By, 
          RFM.Updated_At, 
          RFM.Updated_By,
          PBB.EMP_KOR_NM,
          PBB.EMP_NO
        FROM 
          RiskFactorManagement AS RFM
        LEFT JOIN 
          GJWD_DBF..PBB01M00 AS PBB 
        ON 
          RFM.Handler = PBB.EMP_NO
        WHERE 
          RFM.Date >= @startDate AND RFM.Date <= @endDate
      `;

      // 옵션에 따른 조건 추가
      if (option === "B") {
        query += " AND RFM.Manager = 'B'";
      } else if (option === "A") {
        query += " AND RFM.Manager = 'A'";
      }

      // 부서에 따른 조건 추가
      if (
        Department &&
        !["안전보건실", "전산팀", "임원"].includes(Department)
      ) {
        query += " AND RFM.Department = @Department";
      }

      const resultManagement = await pool
        .request()
        .input("startDate", sql.Date, formattedStartDate)
        .input("endDate", sql.Date, formattedEndDate)
        .input("Department", sql.VarChar, Department) // 부서 매개변수 추가
        .query(query);

      res.json(resultManagement.recordset); // 비어 있는 경우에도 데이터를 배열로 직접 응답
    } catch (err) {
      console.error("데이터베이스 오류 발생!", err);
      // 클라이언트에게 상세한 오류 메시지 전송
      res.status(500).json({
        error: "서버 오류 발생",
        message: err.message || "알 수 없는 오류가 발생했습니다!",
        details: err,
      });
    }
  });

  // 해당 영상이나 사진 X표 누를때!! RFSeq . ContentSeq 을 받으면 상태값 N으로  => 파일 비활성화!
  app.post("/update/ContentStatus", checkLogin, async (req, res) => {
    const { RFSeq, ContentSeq } = req.body; // 클라이언트로부터 RFSeq, ContentSeq 받음

    // 받은 데이터를 콘솔에 출력
    console.log("Received data:", { RFSeq, ContentSeq });

    const pool = await poolPromise; // 데이터베이스 연결 풀을 얻습니다
    const transaction = new sql.Transaction(pool); // Create a new transaction object

    try {
      await transaction.begin(); // Begin the transaction

      const updateQuery = `
                UPDATE RiskFactorContents
                SET ContentStatus = 'N'
                WHERE RFSeq = @RFSeq AND ContentSeq = @ContentSeq;
            `;

      const request = new sql.Request(transaction); // Create a request object in the context of the transaction
      request
        .input("RFSeq", sql.Int, RFSeq)
        .input("ContentSeq", sql.Int, ContentSeq);

      const result = await request.query(updateQuery);

      if (result.rowsAffected[0] > 0) {
        await transaction.commit(); // Commit the transaction if the update was successful
        res.send({
          success: true,
          message: "Content status updated to 'N' successfully.",
        });
      } else {
        await transaction.rollback(); // Rollback the transaction if no rows were affected
        res.status(404).send("No data found to update.");
      }
    } catch (err) {
      await transaction.rollback(); // Rollback the transaction on any other type of error
      console.error("Database error occurred:", err);
      res.status(500).send("Error updating content status.");
    }
  });

  // 관리자에서 파일(이미지 영상)을 수정할때!! 바로 DB에 update
  // https://10.1.1.30:3001/update/content
  app.post(
    "/update/content",
    checkLogin,
    upload.array("files"),
    async (req, res) => {
      const { RFSeq, RFKind, Handler } = req.body;

      console.log("Full request body:", req.body);

      if (!req.files || req.files.length === 0) {
        return res.status(400).send("No files were uploaded.");
      }

      const pool = await poolPromise; // Get database connection pool
      const transaction = new sql.Transaction(pool);

      try {
        await transaction.begin(); // Start the transaction

        // Fetch Handler details
        const handlerQuery = `
                SELECT	Handler = EMP_NO,
                Handler_nm = EMP_KOR_NM,
                Handler_dep = GJWD_DBF.DBO.F_DEPT_NM(DEPT_CD),
                Handler_hp = REPLACE(CEL_TEL_NO,'-','') 
                FROM GJWD_DBF..PBB01M00
                WHERE RETIRE_YN = 'N' 
                AND MILL_CD = 'SB' 
                AND EMP_NO = @Handler
                ORDER BY Handler_dep;
            `;
        const handlerDetails = await pool
          .request()
          .input("Handler", sql.Int, Handler)
          .query(handlerQuery);

        if (handlerDetails.recordset.length === 0) {
          return res.status(404).send("Handler details not found.");
        }

        const handlerName = handlerDetails.recordset[0].Handler_nm; //Handler_nm 사번에 해당하는 사원 이름!!!

        let createdByValue;
        try {
          const result = await pool
            .request()
            .input("RFSeq", sql.Int, RFSeq)
            .input("RFKind", sql.Char, RFKind)
            .query(
              "SELECT TOP 1 Created_By FROM RiskFactorContents WHERE RFSeq = @RFSeq AND RFKind = @RFKind"
            );
          createdByValue =
            result.recordset.length > 0
              ? result.recordset[0].Created_By
              : "DefaultUser";
        } catch (error) {
          console.error("Failed to fetch Created_By:", error);
          return res
            .status(500)
            .send("Failed to fetch initial data for content upload.");
        }

        // Select the maximum sequence number for the current RFSeq
        const seqQuery = `
                SELECT MAX(ContentSeq) as MaxSeq
                FROM RiskFactorContents
                WHERE RFSeq = @RFSeq;
            `;
        let request = new sql.Request(transaction);
        request.input("RFSeq", sql.Int, RFSeq);
        const seqResult = await request.query(seqQuery);
        let currentMaxSeq = seqResult.recordset[0].MaxSeq || 0;

        const responses = [];

        // 파일별로 처리
        for (const file of req.files) {
          currentMaxSeq++; // ContentSeq 증가

          const date = moment().format("YYYY-MM-DD");
          const fileUrl = `${req.protocol}://${req.get(
            "host"
          )}/uploads/${date}/${file.filename}`;

          request = new sql.Request(transaction);
          const upsertQuery = `
                MERGE INTO RiskFactorContents AS target
                USING (VALUES (@RFSeq, @RFKind, @fileUrl, 'Y', @currentMaxSeq, GETDATE(), @handlerName, GETDATE()))
                    AS source (RFSeq, RFKind, ContentURL, ContentStatus, ContentSeq, Created_At, Updated_By, Updated_At)
                ON target.RFSeq = source.RFSeq AND target.ContentSeq = source.ContentSeq
                WHEN MATCHED THEN
                    UPDATE SET 
                        ContentURL = source.ContentURL, 
                        Updated_By = ISNULL(target.Updated_By, source.Updated_By),
                        Updated_At = GETDATE(),
                        Created_By = target.Created_By
                WHEN NOT MATCHED THEN
                    INSERT (RFSeq, RFKind, ContentURL, ContentStatus, ContentSeq, Created_At, Updated_By, Updated_At, Created_By)
                    VALUES (source.RFSeq, source.RFKind, source.ContentURL, source.ContentStatus, source.ContentSeq, source.Created_At, source.Updated_By, GETDATE(),  @createdByValue);  
                `;
          request
            .input("RFSeq", sql.Int, RFSeq)
            .input("RFKind", sql.Char, RFKind)
            .input("fileUrl", sql.NVarChar, fileUrl)
            .input("currentMaxSeq", sql.Int, currentMaxSeq)
            .input("handlerName", sql.NVarChar, handlerName)
            .input("createdByValue", sql.NVarChar, createdByValue);
          await request.query(upsertQuery);

          responses.push({ ContentURL: fileUrl, ContentSeq: currentMaxSeq });
        }

        await transaction.commit(); // Commit the transaction
        res.json({
          success: true,
          message: "Contents successfully uploaded.",
          data: responses,
        });
      } catch (err) {
        await transaction.rollback(); // Rollback the transaction on error
        console.error("Database error occurred:", err);
        res.status(500).send("Error processing content upload.");
      }
    }
  );

  // 주임님 데이터 받는 부분!!! 바로 DB에 update
  // https://10.1.1.30:3001/update/content/LEE
  app.post("/update/content/LEE", upload.array("files"), async (req, res) => {
    const { RFSeq, RFKind } = req.body; // 클라이언트로부터 RFSeq, RFKind 받음

    console.log("Full request body:", req.body);

    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No files were uploaded.");
    }

    const pool = await poolPromise; // 데이터베이스 연결 풀을 얻습니다
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin(); // Start the transaction

      const seqQuery = `
                SELECT MAX(ContentSeq) as MaxSeq
                FROM RiskFactorContents
                WHERE RFSeq = @RFSeq;
            `;
      let request = new sql.Request(transaction);
      request.input("RFSeq", sql.Int, RFSeq);
      const seqResult = await request.query(seqQuery);
      let currentMaxSeq = seqResult.recordset[0].MaxSeq || 0; // 현재 최대 ContentSeq, 없다면 0

      const responses = [];

      // 파일별로 처리
      for (const file of req.files) {
        currentMaxSeq++; // ContentSeq 증가

        const date = moment().format("YYYY-MM-DD");
        const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${date}/${
          file.filename
        }`;

        console.log("Uploading file:", {
          filename: file.filename,
          contentType: file.mimetype,
          size: file.size,
        }); // Log file details

        request = new sql.Request(transaction); // Reinitialize request for each file upload
        const insertQuery = `
                    INSERT INTO RiskFactorContents (RFSeq, RFKind, ContentURL, ContentStatus, ContentSeq, Created_At, Created_By)
                    VALUES (@RFSeq, @RFKind, @ContentURL, 'Y', @ContentSeq, GETDATE(), 'System');
                `;
        request
          .input("RFSeq", sql.Int, RFSeq)
          .input("RFKind", sql.Char, RFKind)
          .input("ContentURL", sql.NVarChar, fileUrl)
          .input("ContentSeq", sql.Int, currentMaxSeq);
        await request.query(insertQuery);

        responses.push({ ContentURL: fileUrl, ContentSeq: currentMaxSeq });
      }

      await transaction.commit(); // Commit the transaction if all files are uploaded successfully
      res.json({
        success: true,
        message: "Contents successfully uploaded.",
        data: responses,
      });
    } catch (err) {
      await transaction.rollback(); // Rollback the transaction if any error occurs
      console.error("Database error occurred:", err);
      res.status(500).send("Error processing content upload.");
    }
  });

  // 관리자가 여러상태의 카드를 누르고 그걸 update할때!!
  app.post("/update/save", checkLogin, async (req, res) => {
    const {
      RFSeq,
      Name,
      Place,
      Department,
      Factors,
      BeforeAction,
      BeforeLevel,
      Solution,
      AfterAction,
      AfterLevel,
      DueDate,
      FinishDate,
      Cost,
      Status,
      Manager,
      Handler,
      Update_Handler,
    } = req.body;

    console.log("Received data:", req.body);

    const pool = await poolPromise; // Assuming poolPromise is your database connection
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin(); // Start the transaction

      const handlerQuery = `
                SELECT	Update_Handler = EMP_NO,
                Handler_nm = EMP_KOR_NM,
                Handler_dep = GJWD_DBF.DBO.F_DEPT_NM(DEPT_CD),
                Handler_hp = REPLACE(CEL_TEL_NO,'-','') 
                FROM GJWD_DBF..PBB01M00
                WHERE RETIRE_YN = 'N' 
                AND MILL_CD = 'SB' 
                AND EMP_NO = @Update_Handler
                ORDER BY Handler_dep;
            `;
      const handlerResult = await pool
        .request()
        .input("Update_Handler", sql.Int, Update_Handler)
        .query(handlerQuery);

      if (handlerResult.recordset.length === 0) {
        await transaction.rollback(); // Rollback transaction because no Update_Handler found
        return res.status(404).send("Update_Handler details not found.");
      }

      const handlerName = handlerResult.recordset[0].Handler_nm;
      console.log("담당자 이름 : ", handlerName);

      const request = new sql.Request(transaction); // Attach the request to the transaction
      const sqlQuery = `
            MERGE INTO RiskFactorManagement AS target
            USING (VALUES (
                @RFSeq, @Name, @Place, @Department, @Factors, @BeforeAction, @BeforeLevel,
                @Solution, @AfterAction, @AfterLevel, @DueDate, @FinishDate, @Cost, @Status, @Manager, @Handler, @UpdatedBy, 
                CASE WHEN @Status = N'접수완료' THEN CONVERT(VARCHAR(10), GETDATE(), 120) ELSE NULL END
            ))
            AS source (
                RFSeq, Name, Place, Department, Factors, BeforeAction, BeforeLevel,
                Solution, AfterAction, AfterLevel, DueDate, FinishDate, Cost, Status, Manager, Handler, UpdatedBy, ReceiptDate
            )
            ON target.RFSeq = source.RFSeq
            WHEN MATCHED THEN
                UPDATE SET
                    Name = source.Name,
                    Place = source.Place,
                    Department = source.Department,
                    Factors = source.Factors,
                    BeforeAction = source.BeforeAction,
                    BeforeLevel = source.BeforeLevel,
                    Solution = source.Solution,
                    AfterAction = source.AfterAction,
                    AfterLevel = source.AfterLevel,
                    DueDate = source.DueDate,
                    FinishDate = source.FinishDate,
                    Cost = source.Cost,
                    Status = source.Status,
                    Manager = source.Manager,
                    Handler = source.Handler,
                    Updated_By = source.UpdatedBy,
                    Updated_At = GETDATE(),
                    ReceiptDate = source.ReceiptDate
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (
                   Name, Place, Department, Factors, BeforeAction, BeforeLevel,
                    Solution, AfterAction, AfterLevel, DueDate, FinishDate, Cost, Status, Manager, Handler, Updated_By, Updated_At , ReceiptDate
                )
                VALUES (
                   source.Name, source.Place, source.Department, source.Factors, source.BeforeAction, source.BeforeLevel,
                    source.Solution, source.AfterAction, source.AfterLevel, source.DueDate, source.FinishDate, source.Cost, source.Status, source.Manager, source.Handler, source.UpdatedBy, GETDATE() , source.ReceiptDate
                );
            `;

      // Binding parameters to the SQL query
      request
        .input("RFSeq", sql.Int, RFSeq)
        .input("Name", sql.NVarChar, Name || null)
        .input("Place", sql.NVarChar, Place || null)
        .input("Department", sql.NVarChar, Department || null)
        .input("Factors", sql.NVarChar, Factors || null)
        .input("BeforeAction", sql.NVarChar, BeforeAction || null)
        .input("BeforeLevel", sql.NVarChar, BeforeLevel || null)
        .input("Solution", sql.NVarChar, Solution || null)
        .input("AfterAction", sql.NVarChar, AfterAction || null)
        .input("AfterLevel", sql.NVarChar, AfterLevel || null)
        .input("DueDate", sql.VarChar, DueDate || null)
        .input("FinishDate", sql.VarChar, FinishDate || null)
        .input("Cost", sql.Numeric(12, 2), Cost ? parseFloat(Cost) : null)
        .input("Status", sql.VarChar, Status || null)
        .input("Manager", sql.VarChar, Manager || null)
        .input("Handler", sql.VarChar, Handler || null)
        .input("UpdatedBy", sql.VarChar, handlerName || null); // Using handlerName fetched earlier

      // Executing the SQL query
      await request.query(sqlQuery);
      await transaction.commit(); // Commit the transaction if no errors

      res.json({
        message: "Data saved successfully",
        yourData: req.body,
      });
    } catch (err) {
      await transaction.rollback(); // Rollback the transaction on error
      console.error("Database operation failed:", err);
      res.status(500).send("Failed to save data due to server error");
    }
  });

  // 계정 등록하는 부분!!
  // 등록후 npm list bcrypt 로 해시된 비밀번호인지 확인!!
  // https://10.1.1.30:3001/register
  // https://riskapi.gjw.co.kr:3001/register
  app.get("/register", (req, res) => {
    res.render("register"); // select_range.ejs 뷰를 렌더링하여 클라이언트에게 보여줍니다.
  });
  app.post("/register", async (req, res) => {
    const { id, pw, Auth, Handler, Department } = req.body;

    try {
      const existingUser = await getUserById(id);

      if (existingUser) {
        // If the user already exists, return an error
        return res
          .status(400)
          .json({ message: "이미 존재하는 아이디입니다!!" });
      }

      const hashedPassword = await bcrypt.hash(pw, 10); // Hashing the password with 10 rounds of salting

      // Assuming you have a pool or similar setup for database connection
      const pool = await poolPromise;

      const query =
        "INSERT INTO Account (id, pw, Auth, Handler, Department) VALUES (@id, @hashedPassword, @Auth, @Handler, @Department)";
      await pool
        .request()
        .input("id", sql.VarChar, id)
        .input("hashedPassword", sql.VarChar, hashedPassword) // Change the parameter name to match the SQL query
        .input("Auth", sql.Int, Auth)
        .input("Handler", sql.Int, Handler)
        .input("Department", sql.VarChar, Department) // Adding the Department parameter
        .query(query);

      res.status(201).send("등록성공!!");
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).send("등록에러ㅜㅜ");
    }
  });

  // 로그인
  app.post("/login", async (req, res) => {
    const { id, pw } = req.body;
    console.log(req.body);

    try {
      const user = await getUserById(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // console.log("클라이언트가 제공한 pw:", pw);
      // console.log("DB에서 찾은 pw :", user.pw );

      const passwordIsValid = await bcrypt.compare(pw, user.pw); // 해쉬암호화 비번 비교!
      // console.log("Password valid:", passwordIsValid);  // 비교값이 일치하는지!
      if (!passwordIsValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Generate token using the separate function
      const payload = { id: user.id, Auth: user.Auth }; // Define payload with user details
      const token = await generateActiveAccessToken(payload);

      if (!token) {
        console.error("토큰 생성 실패");
        return res.status(500).json({ message: "토큰 생성 실패" });
      }

      console.log("서버가 클라이언트에게 새로 주는 토큰!", token);
      // Insert token into database
      await insertLoginToken(user.id, token);

      res.status(200).json({
        id: user.id,
        token: token,
        Auth: user.Auth,
        Handler: user.Handler,
        Department: user.Department, // Department 필드 추가
      });
    } catch (error) {
      console.error("Login error: ", error);
      res.status(500).send({ message: "Error logging in" });
    }
  });

  // 알리고를 위한!!!
  app.post("/checkhp", checkLogin, async (req, res) => {
    const { RFSeq } = req.body;
    console.log(req.body);

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 인증서 검증 무시
    });
    // Assuming poolPromise is your database connection pool that's already configured elsewhere
    const pool = await poolPromise;
    const query = `
            SELECT
                P.Handler_nm,
                P.Handler_hp,
                R.Factors
            FROM
                RiskFactorManagement R
            JOIN
                (SELECT
                    EMP_NO as Handler,
                    EMP_KOR_NM as Handler_nm,
                    REPLACE(CEL_TEL_NO, '-', '') as Handler_hp
                FROM
                    GJWD_DBF..PBB01M00
                WHERE
                    RETIRE_YN = 'N'
                    AND MILL_CD = 'SB') P
            ON
                R.Handler = P.Handler
            WHERE
                R.RFSeq = @RFSeq;
        `;

    try {
      const result = await pool
        .request()
        .input("RFSeq", sql.Int, RFSeq)
        .query(query);

      if (result.recordset.length > 0) {
        const { Handler_nm, Handler_hp, Factors } = result.recordset[0];

        const managerHp1 = "070-7113-6349(파트장)";
        const managerHp2 = "070-7113-6357(담당)";

        const succsubject = "업무 배정 알림(위험성평가관리)";
        const succcontent = `[경주월드 업무 알림]
위험성 평가 관리 담당자로 지정되었습니다.
                
아래 진행 순서를 읽은 뒤 '위험요인 확인 및 개선' 버튼을 누르고 절차에 따라 원내 위험요인 개선에 힘써주시기 바랍니다.
                
업무에 협조해주셔서
대단히 감사합니다.
                
* 신고내용
${Factors}
                
* 진행 순서
1. 신고자, 관리자가 등록한 내용 확인
2. 개선 계획을 수립하고 개선 예정일 등록
3. 감소 대책 등록 및 진행
4. 완료 후 완료일, 비용, 관련자료(사진/비디오)를 추가하고 페이지 하단의 버튼을 눌러서 최종 완료
                
* 문의전화 [안전보건실]
- ${managerHp1}
- ${managerHp2}`;

        const formData = new FormData();
        formData.append("apikey", "4wqbyu1ntoq5v99k69vbcpu6zni10bbz");
        formData.append("userid", "gjwaligo");
        formData.append(
          "senderkey",
          "cd7965755d0b0cb28462a68606a7d59afee4a5b7"
        );
        formData.append("tpl_code", "TS_6233");
        formData.append("sender", "1544-8765");
        formData.append("receiver_1", Handler_hp);
        formData.append("recvname_1", Handler_nm);
        formData.append("subject_1", succsubject);
        formData.append("message_1", succcontent);
        formData.append(
          "button_1",
          JSON.stringify({
            button: [
              {
                name: "위험 요인 확인 및 개선",
                linkType: "WL", // AC, DS, WL, AL, BK, MD 중에서 1개
                linkTypeName: "웹링크", // 채널 추가, 배송조회, 웹링크, 앱링크, 봇키워드, 메시지전달 중에서 1개
                linkMo:
                  "https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=" +
                  RFSeq,
                linkPc:
                  "https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=" +
                  RFSeq,
                //linkIos: '설정한 IOS Scheme',
                //linkAnd: '설정한 Android Scheme'
              },
            ],
          })
        );
        formData.append("failover", "Y");

        const failsubject = `[경주월드 업무 알림]`;
        const failcontent = `위험성 평가 관리 담당자로 지정되었습니다.
  
아래 진행 순서를 읽은 뒤 '위험요인 확인 및 개선' 버튼을 누르고 절차에 따라 원내 위험요인 개선에 힘써주시기 바랍니다.
  
업무에 협조해주셔서
대단히 감사합니다.
  
* 신고내용
${Factors}
  
* 진행 순서
1. 신고자, 관리자가 등록한 내용 확인
2. 개선 계획을 수립하고 개선 예정일 등록
3. 감소 대책 등록 및 진행
4. 완료 후 완료일, 비용, 관련자료(사진/비디오)를 추가하고 페이지 하단의 버튼을 눌러서 최종 완료
  
* 관리 페이지 URL
https://smart.gjw.co.kr/common/riskFactor001.do?RFSeq=${RFSeq}
  
* 문의전화 [안전보건실]
- ${managerHp1}
- ${managerHp2}`;

        formData.append("fsubject_1", failsubject);
        formData.append("fmessage_1", failcontent);
        console.log(formData);

        axios
          .post("https://kakaoapi.aligo.in/akv10/alimtalk/send/", formData, {
            headers: formData.getHeaders(),
            httpsAgent,
          })
          .then((response) => {
            console.log(response.data);
            res.json({
              success: true,
              message: "Notification sent successfully",
              data: response.data,
            });
          })
          .catch((error) => {
            console.error(error);
            res.status(500).send("Failed to send notification");
          });
      } else {
        res.status(404).send("No details found for the provided RFSeq");
      }
    } catch (err) {
      console.error("Database query error:", err);
      res.status(500).send("Error processing request");
    }
  });

  //추가(2024-05-18)
  // 태블로에서 토큰 받아오기!!
  app.get("/get-trusted-token", async (req, res) => {
    const TABLEAU_SERVER_URL = "http://tis.gjw.co.kr:8000";
    const USERNAME = "embed"; // 사용자 이름 설정

    try {
      const response = await axios.post(`${TABLEAU_SERVER_URL}/trusted`, null, {
        params: {
          username: USERNAME,
          client_ip: "211.54.171.41",
        },
      });

      const ticket = response.data; //태블로 서버에서 받은 토큰값!

      if (ticket === "-1") {
        res.status(500).send("Failed to obtain trusted ticket");
      } else {
        res.send(ticket);
      }
    } catch (error) {
      res.status(500).send(`Error: ${error.message}`);
    }
  });
};
