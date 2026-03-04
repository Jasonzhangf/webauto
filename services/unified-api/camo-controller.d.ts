declare module '@web-auto/camo/src/services/controller/controller.js' {
  export class UiController {
    constructor(options?: any);
    handleAction(action: string, payload?: any): Promise<any>;
  }
}
