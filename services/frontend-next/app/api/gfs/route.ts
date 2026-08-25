import { NextResponse } from "next/server";

function fallbackWind() {
  const nx = 49,
    ny = 23,
    count = nx * ny,
    u = new Array(count),
    v = new Array(count);
  for (let y = 0; y < ny; y++) {
    const lat = 10 - y;
    for (let x = 0; x < nx; x++) {
      const lon = 94 + x,
        i = y * nx + x;
      u[i] = Number(
        (Math.sin(lat * 0.2) * 4.5 + Math.cos(lon * 0.1) * 2 + 3.5).toFixed(2),
      );
      v[i] = Number(
        (Math.cos(lat * 0.15) * 3 + Math.sin(lon * 0.2) * 1.5 + 1.8).toFixed(2),
      );
    }
  }
  const header = {
    parameterCategory: 2,
    parameterUnit: "m.s-1",
    refTime: new Date().toISOString(),
    nx,
    ny,
    lo1: 94,
    la1: 10,
    lo2: 142,
    la2: -12,
    dx: 1,
    dy: 1,
  };
  return [
    {
      header: {
        ...header,
        parameterNumber: 2,
        parameterNumberName: "U-component_of_wind",
      },
      data: u,
    },
    {
      header: {
        ...header,
        parameterNumber: 3,
        parameterNumberName: "V-component_of_wind",
      },
      data: v,
    },
  ];
}

export async function GET() {
  try {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("https://opsroom.sipongidata.my.id/api/gfs", {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timer);
    if (response.ok) {
      const payload = await response.json(),
        result =
          payload && typeof payload === "object" && "data" in payload
            ? payload.data
            : payload;
      if (Array.isArray(result)) {
        const uWind = result.find(
            (entry) =>
              entry?.header?.parameterNumber === 2 ||
              String(entry?.header?.parameterNumberName || "")
                .toLowerCase()
                .startsWith("u-component"),
          ),
          vWind = result.find(
            (entry) =>
              entry?.header?.parameterNumber === 3 ||
              String(entry?.header?.parameterNumberName || "")
                .toLowerCase()
                .startsWith("v-component"),
          );
        if (uWind && vWind) return NextResponse.json([uWind, vWind]);
      }
    }
  } catch {}
  return NextResponse.json(fallbackWind());
}
