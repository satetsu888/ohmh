declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production';
    OH_MY_HOOKS_BASE_URL?: string;
  }
}