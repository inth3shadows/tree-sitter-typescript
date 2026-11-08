// Auto-accessors can follow other field modifiers (upstream #369).
class AccessorBase { accessor value = 1; }
class AccessorDerived extends AccessorBase {
  static accessor shared = 1;
  public static accessor publicShared: number = 2;
  private static accessor privateShared = 3;
  protected static accessor protectedShared = 4;
  static accessor #hidden = 5;
  override accessor value = 6;
  public override accessor accessor = 7;
}
abstract class AbstractAccessors extends AccessorBase {
  abstract accessor item: number;
  protected abstract accessor protectedItem: number;
}
