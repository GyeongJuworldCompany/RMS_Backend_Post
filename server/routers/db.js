// MSSQL 과 연동하는 부분!!
const sql = require('mssql');

// DB 구성!
const config = {
    server: '10.1.1.217',
    port: 53389,
    options: { encrypt:false, database: 'RiskAnalytics' },
    authentication:{
        type:"default",
        options:{
            userName:"riskAdm",
            password:"rudwn*1324"
        }
    }
};

// config에 정의된 설정을 사용하여 sql.ConnectionPool 클래스를 사용하여 새로운 연결 풀 생성
const poolPromise = new sql.ConnectionPool(config).connect().then(pool => {
  console.log('MSSQL과 연결 성공!');
  return pool;
}).catch(err => {
  console.error('MSSQL 연결 실패:', err);
  process.exit(1);
});

module.exports = {
  sql, 
  poolPromise
};
