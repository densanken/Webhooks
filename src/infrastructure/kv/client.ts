export class Kv {
  private static instance: Kv | null = null;

  private constructor(public readonly kv: Deno.Kv) {}

  static async getInstance(): Promise<Kv> {
    if (this.instance === null) {
      const KV_PATH = Deno.env.get("KV_PATH") || undefined;
      const kv = await Deno.openKv(KV_PATH);
      this.instance = new Kv(kv);
    }

    return this.instance;
  }

  static async getKv(): Promise<Deno.Kv> {
    const instance = await this.getInstance();
    return instance.kv;
  }
}
