import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const jpegBuffer = await sharp(inputBuffer)
      .rotate() // auto-rotate based on EXIF
      .jpeg({ quality: 85 })
      .toBuffer();

    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `inline; filename="converted.jpg"`,
      },
    });
  } catch (err: any) {
    console.error("[convert-heic] Error:", err.message);
    return NextResponse.json({ error: "Conversion failed" }, { status: 500 });
  }
}
