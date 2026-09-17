import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "5000";
    const nlpUrl = process.env.NLP_INTERNAL_URL || "http://disease-nlp-python:8000";
    const res = await fetch(`${nlpUrl}/export-dataset?limit=${limit}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to export dataset from NLP service", detail: error?.message },
      { status: 500 }
    );
  }
}
