// vite/client 타입과 합쳐진다 (테스트·검사 환경에 vite 가 없어도 컴파일되도록 최소 선언)
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
