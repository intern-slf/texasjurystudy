import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Dynamic import so any WASM/module-load errors are caught below
    const convert = (await import("heic-convert")).default;

    const jpegBuffer = await convert({
      buffer: inputBuffer as unknown as ArrayBuffer,
      format: "JPEG",
      quality: 0.85,
    });

    const outputBuffer = Buffer.isBuffer(jpegBuffer)
      ? jpegBuffer
      : Buffer.from(jpegBuffer as unknown as ArrayBuffer);

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  } catch (err: any) {
    const msg = err?.message ?? "Unknown error";
    console.error("[convert-heic]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
