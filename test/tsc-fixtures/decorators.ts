// Decorators: class, member and parameter forms
declare function dec(...args: any[]): any;
declare function factory(name: string): (...args: any[]) => any;

@dec
@factory("svc")
export class Service {
  @dec static s = 1;
  @dec field = 2;
  @factory("x") accessor acc = 3;

  constructor(@dec private readonly dep: string, @factory("opt") public opt?: number) {}

  @dec
  method(@dec a: string, @factory("b") b: number): void {
    void a, b;
  }

  @dec get value(): number {
    return 1;
  }

  @dec set value(v: number) {
    void v;
  }
}

export const Expr = @dec class {};
