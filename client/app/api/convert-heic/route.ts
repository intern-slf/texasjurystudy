import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // A body that isn't form data is a bad request, not a conversion failure.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data upload" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[convert-heic]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
