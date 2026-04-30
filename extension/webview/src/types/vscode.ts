export interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}