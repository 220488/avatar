import { writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

const SAVE_DIR = "/Users/rivenhung/code-avatar";

export async function POST(req: NextRequest) {
  try {
    const { dataUrl, format } = await req.json() as { dataUrl: string; format: "png" | "jpg" };

    // Strip the data URL prefix to get raw base64
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ascii-avatar-${timestamp}.${format}`;
    const filepath = join(SAVE_DIR, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ ok: true, path: filepath });
  } catch (err) {
    console.error("Failed to save avatar:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
