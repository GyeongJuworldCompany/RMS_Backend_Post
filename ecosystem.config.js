module.exports = {
  apps: [
    {
      name: "rms server",
      script: "./server.js", // 애플리케이션의 진입점 파일 경로
      watch: true, // 파일 변경 감지 여부
      ignore_watch: ["node_modules"], // 감시할 파일 또는 디렉터리 제외
      instances: 1, // 프로세스 인스턴스 수
      exec_mode: "fork", // 실행 모드 (fork 또는 cluster)
      max_memory_restart: "16G", // 최대 메모리 사용량을 초과할 경우 재시작
      log_date_format: "YYYY-MM-DD HH:mm:ss", // 로그의 날짜 형식
      error_file: "logs/error.log", // 에러 로그 파일 경로
      out_file: "logs/output.log", // 표준 출력 로그 파일 경로
      pid_file: "logs/app.pid", // PID 파일 경로
      env: {
        NODE_ENV: "production", // 환경 변수 설정
        PORT: 3001,
      },
    },
  ],
};
