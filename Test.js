
    // File_ Test
    // --------------------------------------------------------------------------------------------------------------------------------
    // FIle_Test API          upload 테이블 이용~                                                                                      |
    // --------------------------------------------------------------------------------------------------------------------------------

    // 파일 업로드 폼을 제공
    http://localhost:3001/upload_file
    app.get('/upload_file', (req, res) => {
        res.render('upload');
    });
    app.post('/upload_file', upload.single('file'), async (req, res) => {
        const file = req.file; // 업로드된 파일 정보
    
        if (!file) {
            return res.status(400).send("파일이 업로드되지 않았습니다.");
        }

        // 파일 URL 생성
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
    
        try {
            const pool = await dbPool; // 데이터베이스 연결
            
            // 파일 정보를 upload 테이블에 삽입
            const sqlQuery = `INSERT INTO upload (filename, filepath, fileurl, regdate) VALUES (@filename, @filepath, @fileurl, GETDATE())`;
            await pool.request()
                .input('filename', sql.NVarChar, file.filename) // 파일 이름 바인딩
                .input('filepath', sql.NVarChar, file.path) // 파일 경로 바인딩
                .input('fileurl', sql.NVarChar, fileUrl) // 파일 URL 바인딩
                .query(sqlQuery);
    
            console.log('파일 정보가 데이터베이스에 성공적으로 저장되었습니다.');
            res.send('<script>alert("파일이 성공적으로 업로드되었습니다."); location.href="/";</script>');
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터베이스에 파일 정보를 저장하는 데 실패했습니다.");
        }
    });

    // 파일 조회
    http://localhost:3001/select_file
    app.get('/select_file', async (req, res) => {
        try {
            const pool = await dbPool;
            const sqlSelectQuery = `SELECT * FROM upload`; // RiskFactorManagement 테이블 전체 데이터 선택

            const result = await pool.request().query(sqlSelectQuery);

            if (result.recordset.length > 0) {
                res.json(result.recordset);  // 조회된 데이터를 JSON 형태로 반환
            } else {
                res.status(404).send("데이터가 존재하지 않습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
        }
    });

    // 파일 다운로드!
    http://localhost:3001/download_file/file-1713424834274.mp4 
    app.get('/download_file/:filename', async (req, res) => {
        const filename = req.params.filename;
        try {
            const pool = await dbPool;
            const sqlQuery = `SELECT filepath FROM upload WHERE filename = @filename`;
            const result = await pool.request()
                .input('filename', sql.NVarChar, filename)
                .query(sqlQuery);
    
            if (result.recordset.length > 0) {
                const filepath = result.recordset[0].filepath;
                const fullPath = path.resolve(__dirname, '..', '..', filepath);
                
                // 스트리밍 방식으로 파일 전송
                const readStream = fs.createReadStream(fullPath);
                readStream.pipe(res);
            } else {
                res.status(404).send("파일을 찾을 수 없습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("파일 다운로드 중 오류가 발생했습니다.");
        }
    });

    // 파일 삭제!
    http://localhost:3001/delete_file/10
    app.delete('/delete_file/:id', async (req, res) => {
        const fileId = parseInt(req.params.id, 10);  // id 값을 정수로 변환
        console.log(req.params.id);
    
        if (isNaN(fileId)) {  // id가 유효한 숫자인지 확인
            return res.status(400).send("유효하지 않은 ID 값입니다.");
        }
    
        try {
            const pool = await dbPool;
            const sqlSelectQuery = `SELECT filepath FROM upload WHERE id = @id`;
            const selectResult = await pool.request()
                .input('id', sql.Int, fileId)
                .query(sqlSelectQuery);
    
            if (selectResult.recordset.length > 0) {
                const filepath = selectResult.recordset[0].filepath;
                // 파일 경로 수정: __dirname을 사용하여 상위 폴더로 이동 후 uploads 폴더로 접근
                const fullPath = path.resolve(__dirname, '..', '..', filepath);  // path.resolve를 사용하여 절대 경로 생성
    
                fs.unlink(fullPath, async (err) => {
                    if (err) {
                        console.error('파일 삭제 시 오류 발생:', err);
                        return res.status(500).send(`파일 삭제 실패: ${err.message}`);
                    }
    
                    const sqlDeleteQuery = `DELETE FROM upload WHERE id = @id`;
                    const deleteResult = await pool.request()
                        .input('id', sql.Int, fileId)
                        .query(sqlDeleteQuery);
    
                    if (deleteResult.rowsAffected[0] > 0) {
                        res.send("파일이 성공적으로 삭제되었습니다.");
                    } else {
                        res.status(404).send("삭제할 파일을 찾을 수 없습니다.");
                    }
                });
            } else {
                res.status(404).send("삭제할 파일을 찾을 수 없습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send(`파일 삭제 중 오류가 발생했습니다: ${err.message}`);
        }
    });

    
    // --------------------------------------------------------------------------------------------------------------------------------
    // RiskFactorManagement API                                                                                                        |
    // --------------------------------------------------------------------------------------------------------------------------------

    // select
    // http://10.1.2.43:3001/riskFactor/select

    app.get('/riskFactor/select', async (req, res) => {
        try {
            const pool = await dbPool;
            const sqlSelectQuery = `SELECT * FROM RiskFactorManagement`; // 전체 레코드 선택
    
            const result = await pool.request()
                .query(sqlSelectQuery);
    
            if (result.recordset.length > 0) {
                res.json(result.recordset);  // 조회된 데이터를 JSON 형태로 반환
            } else {
                res.status(404).send("데이터가 존재하지 않습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
        }
    });

    // RiskFactorManagement에서 특정 RFSeq 지정 DB 조회
    // http://10.1.2.43:3001/riskFactor/select/1
    app.get('/riskFactor/select/:RFSeq', async (req, res) => {
        const { RFSeq } = req.params; // URL 파라미터에서 RFSeq 추출
    
        try {
            const pool = await dbPool;
            const sqlSelectQuery = `SELECT * FROM RiskFactorManagement WHERE RFSeq = @RFSeq`;
    
            const result = await pool.request()
                .input('RFSeq', sql.Int, RFSeq)
                .query(sqlSelectQuery);
    
            if (result.recordset.length > 0) {
                res.json(result.recordset[0]);  // 조회된 데이터를 JSON 형태로 반환
            } else {
                res.status(404).send("해당 RFSeq를 가진 레코드를 찾을 수 없습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
        }
    });

    //  지정 delete
    // http://localhost:3001/riskFactor/delete/21  => 브라우저에서 바로 접근 ㄴㄴ 포스트맨 ㄱㄱ
    app.delete('/riskFactor/delete/:RFSeq', async (req, res) => {
        const { RFSeq } = req.params; // URL 파라미터에서 RFSeq 추출
    
        console.log("삭제 요청 받음: RFSeq =", RFSeq); // 삭제 요청 로그
    
        try {
            const pool = await dbPool;
            const sqlDeleteQuery = `DELETE FROM RiskFactorManagement WHERE RFSeq = @RFSeq`;
    
            const request = pool.request();
            request.input('RFSeq', sql.Int, RFSeq);
            const result = await request.query(sqlDeleteQuery);
    
            console.log("SQL 실행 결과:", result); // SQL 쿼리 실행 결과 로그
    
            if (result.rowsAffected[0] > 0) {
                console.log("레코드 삭제 성공: RFSeq =", RFSeq); // 삭제 성공 로그
                res.send("레코드가 성공적으로 삭제되었습니다.");
            } else {
                console.log("삭제할 레코드 없음: RFSeq =", RFSeq); // 레코드 미발견 로그
                res.status(404).send("해당 RFSeq를 가진 레코드를 찾을 수 없습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 삭제 중 오류가 발생했습니다.");
        }
    });



    // --------------------------------------------------------------------------------------------------------------------------------
    //  RiskFactorContents API                                                                                                        |
    // --------------------------------------------------------------------------------------------------------------------------------

    // select
    // http://10.1.2.43:3001/risk_contents/select
    app.get('/risk_contents/select', async (req, res) => {
        try {
            const pool = await dbPool;
            const sqlQuery = `SELECT * FROM RiskFactorContents`; // 전체 데이터 조회 쿼리
        
            const result = await pool.request().query(sqlQuery); // 쿼리 실행
        
            if (result.recordset.length > 0) {
                res.json(result.recordset); // 조회된 데이터를 JSON 형태로 반환
            } else {
                res.status(404).send("RiskFactorContents 테이블에 데이터가 존재하지 않습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
        }
    });

    // 특정 RFSeq 지정 select
    // http://10.1.2.43:3001/risk_contents/select/1
    app.get('/risk_contents/select/:RFSeq', async (req, res) => {
        const { RFSeq } = req.params;
    
        try {
            const pool = await dbPool;
            const sqlQuery = `
                SELECT * FROM RiskFactorContents
                WHERE RFSeq = @RFSeq`;
    
            const result = await pool.request()
                .input('RFSeq', sql.Int, RFSeq)
                .query(sqlQuery);
    
            if (result.recordset.length > 0) {
                res.json(result.recordset);
            } else {
                res.status(404).send("해당 RFSeq를 가진 RiskFactorContents 데이터가 존재하지 않습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 조회 중 오류가 발생했습니다.");
        }
    });


    // 특정 RFSeq 지정 delete
    // http://10.1.2.43:3001/risk_contents/delete/1
    app.delete('/risk_contents/delete/:RFSeq', async (req, res) => {
        const { RFSeq } = req.params; // URL 파라미터에서 RFSeq 추출
    
        try {
            const pool = await dbPool;
            const sqlDeleteQuery = `
                DELETE FROM RiskFactorContents
                WHERE RFSeq = @RFSeq`;
    
            const result = await pool.request()
                .input('RFSeq', sql.Int, RFSeq)
                .query(sqlDeleteQuery);
    
            if (result.rowsAffected[0] > 0) {
                console.log("삭제 성공: RFSeq =", RFSeq); // 성공 로그
                res.send(`RFSeq가 ${RFSeq}인 RiskFactorContents 데이터가 성공적으로 삭제되었습니다.`);
            } else {
                console.log("삭제할 데이터 없음: RFSeq =", RFSeq); // 데이터 없음 로그
                res.status(404).send(`해당 RFSeq를 가진 RiskFactorContents 데이터가 존재하지 않습니다.`);
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("데이터 삭제 중 오류가 발생했습니다.");
        }
    });


    // 특정 RFSeq 지정 download
    // http://10.1.2.43:3001/risk_contents/download/22
    app.get('/risk_contents/download/:RFSeq', async (req, res) => {
        const { RFSeq } = req.params;
    
        try {
            const pool = await dbPool;
            const sqlQuery = `SELECT ContentURL FROM RiskFactorContents WHERE RFSeq = @RFSeq`;
    
            const result = await pool.request()
                .input('RFSeq', sql.Int, RFSeq)
                .query(sqlQuery);
    
            if (result.recordset.length > 0) {
                const contentURL = result.recordset[0].ContentURL;
    
                // URL 검증 및 파일 경로 추출
                if (!contentURL || !contentURL.includes('/uploads/')) {
                    return res.status(400).send("잘못된 파일 URL입니다.");
                }
                const contentPath = contentURL.split('/uploads/')[1];
                if (!contentPath) {
                    return res.status(400).send("파일 경로를 찾을 수 없습니다.");
                }
    
                const filePath = path.resolve(__dirname, '..', '..', 'uploads', contentPath);
                console.log("File path:", filePath); // 파일 경로 로그 출력
    
                // 파일 존재 확인 후 스트리밍 전송
                fs.access(filePath, fs.constants.F_OK, (err) => {
                    if (err) {
                        return res.status(404).send("파일을 찾을 수 없습니다.");
                    }
                    
                    const readStream = fs.createReadStream(filePath);
                    readStream.on('open', function () {
                        res.setHeader('Content-Disposition', 'attachment; filename=' + path.basename(filePath));
                        res.setHeader('Content-Type', 'application/octet-stream');
                        readStream.pipe(res);
                    });
    
                    readStream.on('error', function(err) {
                        res.status(404).send("파일을 찾을 수 없습니다.");
                    });
                });
            } else {
                res.status(404).send("해당 RFSeq를 가진 파일이 존재하지 않습니다.");
            }
        } catch (err) {
            console.error('데이터베이스 오류 발생:', err);
            res.status(500).send("파일 다운로드 중 오류가 발생했습니다.");
        }
    });

   