declare module 'hono' {
  export type Context = any;
  export class Hono {
    get(path: string, handler: (...args: any[]) => any): any;
    post(path: string, handler: (...args: any[]) => any): any;
    put(path: string, handler: (...args: any[]) => any): any;
    patch(path: string, handler: (...args: any[]) => any): any;
    delete(path: string, handler: (...args: any[]) => any): any;
  }
}
