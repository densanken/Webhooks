export class Kv {
  private static instance: Kv | null = null;
  private static initializing: Promise<Kv> | null = null;

  private constructor(public readonly kv: Deno.Kv) {}

  static async getInstance(): Promise<Kv> {
    if (this.instance !== null) return this.instance;
    if (this.initializing !== null) return await this.initializing;

    this.initializing = (async () => {
      const KV_PATH = Deno.env.get("KV_PATH") || undefined;
      const kv = await Deno.openKv(KV_PATH);
      const created = new Kv(kv);
      this.instance = created;
      this.initializing = null;
      return created;
    })();

    return await this.initializing;
  }

  static async getKv(): Promise<Deno.Kv> {
    const instance = await this.getInstance();
    return instance.kv;
  }
}
