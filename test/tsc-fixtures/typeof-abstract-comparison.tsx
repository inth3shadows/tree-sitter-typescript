// Invalid type-query operands must keep the valid runtime comparison reading.
namespace RuntimeCalls {
  declare function abstract(x: unknown): number;
  declare const f: string, x: any;
  f < typeof abstract(x) > (x);
  const holder = { abstract: abstract };
  f < typeof holder.abstract(x) > (x);
}
namespace RuntimeProperties {
  declare const abstract: { abstract: { abstract: number } };
  declare const f: any, x: any;
  f < typeof abstract["abstract"].abstract > (x);
}

namespace RuntimeOptional {
  declare const abstract: { abstract: { value: number } } | undefined;
  declare const f: string, x: any;
  f < typeof abstract?.abstract > (x);
  f < typeof abstract?.abstract.value > (x);
  f < typeof abstract?.["abstract"] > (x);
  f < typeof abstract?.abstract["value"] > (x);
}
namespace RuntimeOptionalNested {
  declare const abstract: { abstract: { value: number } | undefined };
  declare const f: string, x: any;
  f < typeof abstract.abstract?.value > (x);
  f < typeof abstract.abstract?.["value"] > (x);
}
