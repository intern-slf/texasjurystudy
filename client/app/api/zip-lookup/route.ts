import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Invalid zip code" }, { status: 400 });
  }

  // Step 1: Get state and coordinates from zippopotam.us
  const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!zipRes.ok) {
    return NextResponse.json({ error: "Zip code not found" }, { status: 404 });
  }

  const zipData = await zipRes.json();
  const place = zipData.places?.[0];
  if (!place) {
    return NextResponse.json({ error: "No location data" }, { status: 404 });
  }

  const state: string = place.state;
  const lat = place.latitude;
  const lon = place.longitude;

  // Step 2: Get county from FCC Census API using coordinates
  let county = "";
  try {
    const fccRes = await fetch(
      `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`
    );
    if (fccRes.ok) {
      const fccData = await fccRes.json();
      county = fccData.results?.[0]?.county_name || "";
    }
  } catch {
    // County lookup is best-effort
  }

  return NextResponse.json({ state, county });
}
