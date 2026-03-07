/**
 * Type declaration for commander (NodeNext resolution workaround).
 * Commander 12 typings are not fully compatible with moduleResolution: NodeNext.
 */
declare module "commander" {
  export class Command {
    name(name: string): this;
    description(desc: string): this;
    version(ver: string): this;
    command(nameAndArgs: string, desc?: string): this;
    argument<T>(name: string, desc?: string): this;
    option(flags: string, desc?: string): this;
    action(fn: (...args: any[]) => void | Promise<void>): this;
    parse(argv?: string[]): this;
    opts<T = Record<string, unknown>>(): T;
  }
}
