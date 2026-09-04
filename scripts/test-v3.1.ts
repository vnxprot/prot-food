import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { haversineKm } from "../src/lib/utils";
import { smartEstimatedDistanceKm } from "../src/lib/hanoi-obstacles";
import { decodePlusCode, extractPlusCode } from "../src/lib/plus-codes";
import { GET as geocode } from "../src/app/api/geocode/route";
import { POST as route } from "../src/app/api/routing/route";

const traLa = { lat: 21.054817, lng: 105.820579 };
const quanTayBac = { lat: 21.046455, lng: 105.811123 };
const westLakeAir = haversineKm(traLa.lat, traLa.lng, quanTayBac.lat, quanTayBac.lng);
const westLakeEstimate = smartEstimatedDistanceKm(traLa, quanTayBac);
assert.ok(westLakeAir > 1.2 && westLakeAir < 1.5, `Unexpected air distance: ${westLakeAir}`);
assert.ok(
  westLakeEstimate >= 6.8 && westLakeEstimate <= 7.2,
  `West Lake estimate must be 6.8–7.2km, got ${westLakeEstimate}`,
);

const hoanKiem = { lat: 21.0285, lng: 105.8542 };
const ngocLam = { lat: 21.0435, lng: 105.8695 };
const redRiverAir = haversineKm(hoanKiem.lat, hoanKiem.lng, ngocLam.lat, ngocLam.lng);
const redRiverEstimate = smartEstimatedDistanceKm(hoanKiem, ngocLam);
assert.ok(redRiverEstimate > redRiverAir, "Cross-river estimate must exceed air distance");
assert.ok(
  redRiverEstimate >= 4.5 && redRiverEstimate <= 5.8,
  `Red River estimate must use a bridge, got ${redRiverEstimate}`,
);

const address = "Trà Là, 3R3C+W6G, Quảng An, Tây Hồ";
assert.equal(extractPlusCode(address), "3R3C+W6G");
const decoded = decodePlusCode(address);
assert.ok(decoded, "Plus Code should decode");
assert.ok(Math.abs(decoded.lat - traLa.lat) < 0.00001, `Unexpected latitude: ${decoded.lat}`);
assert.ok(Math.abs(decoded.lng - traLa.lng) < 0.00001, `Unexpected longitude: ${decoded.lng}`);

console.log(
  JSON.stringify(
    {
      westLake: { airKm: westLakeAir, estimatedKm: westLakeEstimate },
      redRiver: { airKm: redRiverAir, estimatedKm: redRiverEstimate },
      plusCode: decoded,
    },
    null,
    2,
  ),
);

async function testApiFallbacks() {
  const geocodeResponse = await geocode(
    new NextRequest(
      `http://localhost/api/geocode?address=${encodeURIComponent(address)}`,
    ),
  );
  const geocodeBody = (await geocodeResponse.json()) as {
    result?: { lat: number; lng: number; confidence: string; source: string };
  };
  assert.equal(geocodeResponse.status, 200);
  assert.equal(geocodeBody.result?.confidence, "high");
  assert.equal(geocodeBody.result?.source, "plus_code");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("provider unavailable");
  };
  try {
    const routingResponse = await route(
      new NextRequest("http://localhost/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: traLa,
          destinations: [{ id: "tay-bac", ...quanTayBac }],
        }),
      }),
    );
    const routingBody = (await routingResponse.json()) as {
      distances: Record<string, number>;
      isEstimated: boolean;
    };
    assert.equal(routingResponse.status, 200);
    assert.equal(routingBody.isEstimated, true);
    assert.ok(routingBody.distances["tay-bac"] >= 6800);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testApiFallbacks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
