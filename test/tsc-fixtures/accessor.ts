// Auto-accessors (TS 4.9)
export class Counter {
  accessor count = 0;
  private accessor secret: string = "s";
  declare readonly tag: string;
  accessor #hidden = 1;
  public accessor flag?: boolean;
}
